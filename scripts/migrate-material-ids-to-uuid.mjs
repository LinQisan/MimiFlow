import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import process from 'node:process'

import 'dotenv/config'
import pg from 'pg'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NAMESPACE = '9ba593d8-9461-4b5b-9d5f-2c28cdbd2af0'
const QUESTION_CANONICAL_KEYS = [
  'prompt',
  'context',
  'contextSentence',
  'options',
  'answer',
  'analysis',
  'explanation',
  'note',
  'questionType',
]

function uuidBytes(value) {
  return Buffer.from(value.replaceAll('-', ''), 'hex')
}

function uuidV5(value) {
  const hash = crypto
    .createHash('sha1')
    .update(uuidBytes(NAMESPACE))
    .update(value)
    .digest()
    .subarray(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function legacyAlias(id) {
  const separator = id.indexOf(':')
  return separator >= 0 ? id.slice(separator + 1) : id
}

function formalId(id) {
  if (UUID_PATTERN.test(id)) return id.toLowerCase()
  const alias = legacyAlias(id)
  return UUID_PATTERN.test(alias) ? alias.toLowerCase() : uuidV5(id)
}

function buildMapping(rows) {
  const targetOwners = new Map()
  const aliasOwners = new Map()
  const mapping = rows.map(row => {
    const nextId = formalId(row.id)
    const aliases = Array.from(new Set([row.id, legacyAlias(row.id)]))
    const existingOwner = targetOwners.get(nextId)
    if (existingOwner && existingOwner !== row.id) {
      throw new Error(`正式 UUID 冲突：${existingOwner} 与 ${row.id} -> ${nextId}`)
    }
    targetOwners.set(nextId, row.id)
    for (const alias of aliases) {
      const owner = aliasOwners.get(alias)
      if (owner && owner !== row.id) {
        throw new Error(`旧 ID 别名冲突：${alias} 同时属于 ${owner} 与 ${row.id}`)
      }
      aliasOwners.set(alias, row.id)
    }
    return {
      oldId: row.id,
      legacyAlias: legacyAlias(row.id),
      uuid: nextId,
      type: row.type,
      changed: row.id !== nextId,
    }
  })
  return mapping
}

function rewriteSourceId(value, mapping) {
  if (typeof value !== 'string' || !value) return value
  for (const item of mapping) {
    for (const alias of [item.oldId, item.legacyAlias]) {
      if (value === alias) return item.uuid
      if (value.startsWith(`${alias}::`)) return `${item.uuid}${value.slice(alias.length)}`
    }
  }
  return value
}

function rewriteSourceUrl(value, mapping) {
  if (typeof value !== 'string' || !value) return value
  let next = value
  const routePrefixes = [
    '/listening/',
    '/subtitles/',
    '/reading/articles/',
    '/reading/ebooks/',
    '/manage/listening/',
    '/manage/shadowing/',
    '/manage/reading/',
    '/manage/questions/',
  ]
  for (const item of mapping) {
    for (const alias of [item.oldId, item.legacyAlias]) {
      for (const prefix of routePrefixes) {
        next = next.replaceAll(`${prefix}${alias}`, `${prefix}${item.uuid}`)
        next = next.replaceAll(
          `${prefix}${encodeURIComponent(alias)}`,
          `${prefix}${encodeURIComponent(item.uuid)}`,
        )
      }
    }
  }
  return next
}

async function countReferences(client, mapping) {
  const sourceCounts = {}
  for (const [table, column] of [
    ['Vocabulary', 'sourceId'],
    ['VocabularySentence', 'sourceId'],
    ['SentenceReview', 'sourceId'],
  ]) {
    const { rows } = await client.query(
      `select "id", "${column}" as value from "${table}" where "${column}" is not null`,
    )
    sourceCounts[`${table}.${column}`] = rows.filter(
      row => rewriteSourceId(row.value, mapping) !== row.value,
    ).length
  }
  const { rows: urlRows } = await client.query(
    'select "id", "sourceUrl" as value from "VocabularySentence" where "sourceUrl" <> \'\'',
  )
  sourceCounts['VocabularySentence.sourceUrl'] = urlRows.filter(
    row => rewriteSourceUrl(row.value, mapping) !== row.value,
  ).length
  return sourceCounts
}

async function buildReport(client) {
  const { rows: materials } = await client.query(
    'select id, type::text from materials order by type, id',
  )
  const mapping = buildMapping(materials)
  const { rows: questionRows } = await client.query(
    `select count(*)::int as total,
      count(*) filter (where content ?| $1::text[])::int as duplicated
     from questions`,
    [QUESTION_CANONICAL_KEYS],
  )
  return {
    generatedAt: new Date().toISOString(),
    namespace: NAMESPACE,
    strategy:
      '保留原 ID 或冒号后缀中的合法 UUID；其他旧 ID 使用固定 namespace 的 UUIDv5。',
    totals: {
      materials: mapping.length,
      idsToChange: mapping.filter(item => item.changed).length,
      questions: questionRows[0].total,
      questionContentRowsToClean: questionRows[0].duplicated,
    },
    referenceRowsToRewrite: await countReferences(client, mapping),
    mapping,
  }
}

async function rewriteReferenceTable(client, table, column, mapping, rewrite) {
  const { rows } = await client.query(
    `select "id", "${column}" as value from "${table}" where "${column}" is not null`,
  )
  let changed = 0
  for (const row of rows) {
    const next = rewrite(row.value, mapping)
    if (next === row.value) continue
    await client.query(
      `update "${table}" set "${column}" = $1 where "id" = $2`,
      [next, row.id],
    )
    changed += 1
  }
  return changed
}

async function applyMigration(client, report) {
  await client.query('begin')
  try {
    for (const item of report.mapping.filter(row => row.changed)) {
      await client.query('update materials set id = $1 where id = $2', [
        item.uuid,
        item.oldId,
      ])
    }

    const rewritten = {}
    for (const [table, column] of [
      ['Vocabulary', 'sourceId'],
      ['VocabularySentence', 'sourceId'],
      ['SentenceReview', 'sourceId'],
    ]) {
      rewritten[`${table}.${column}`] = await rewriteReferenceTable(
        client,
        table,
        column,
        report.mapping,
        rewriteSourceId,
      )
    }
    rewritten['VocabularySentence.sourceUrl'] = await rewriteReferenceTable(
      client,
      'VocabularySentence',
      'sourceUrl',
      report.mapping,
      rewriteSourceUrl,
    )

    const questionCleanup = await client.query(
      `update questions
       set content = content - $1::text[]
       where content ?| $1::text[]`,
      [QUESTION_CANONICAL_KEYS],
    )
    const metadataCleanup = await client.query(
      `update materials
       set metadata = metadata - 'legacy'
       where metadata ? 'legacy'`,
    )

    const { rows: invalidRows } = await client.query(
      `select id from materials
       where id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    )
    if (invalidRows.length > 0) {
      throw new Error(`迁移后仍有 ${invalidRows.length} 个非 UUID 素材 ID。`)
    }

    await client.query('commit')
    return {
      materialIdsChanged: report.totals.idsToChange,
      questionContentRowsCleaned: questionCleanup.rowCount,
      materialLegacyMetadataRowsCleaned: metadataCleanup.rowCount,
      referenceRowsRewritten: rewritten,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

const apply = process.argv.includes('--apply')
const reportIndex = process.argv.indexOf('--report-file')
const reportFile = reportIndex >= 0 ? process.argv[reportIndex + 1] : ''
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置。')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const report = await buildReport(client)
  if (reportFile) {
    await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  const result = apply ? await applyMigration(client, report) : null
  process.stdout.write(`${JSON.stringify({ report, applied: result }, null, 2)}\n`)
} finally {
  await client.end()
}
