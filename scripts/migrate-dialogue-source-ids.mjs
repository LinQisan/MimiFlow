import fs from 'node:fs/promises'
import process from 'node:process'

import 'dotenv/config'
import pg from 'pg'

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^#\d+收藏笔记编辑/, '')
    .replace(/[\s、。！？?「」『』,.!()（）0-9０-９]/g, '')
}

function bigrams(value) {
  const result = []
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2))
  }
  return result
}

function similarity(left, right) {
  if (left === right) return 1
  const leftBigrams = bigrams(left)
  const rightBigrams = bigrams(right)
  const counts = new Map()
  for (const item of leftBigrams) counts.set(item, (counts.get(item) || 0) + 1)
  let overlap = 0
  for (const item of rightBigrams) {
    if (!counts.get(item)) continue
    overlap += 1
    counts.set(item, counts.get(item) - 1)
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length || 1)
}

function sourceTypeForMaterial(type) {
  return type === 'MEDIA_SUBTITLE' ? 'MEDIA_SUBTITLE_LINE' : 'AUDIO_DIALOGUE'
}

function sourceIdForDialogue(dialogue) {
  const suffix =
    dialogue.materialType === 'MEDIA_SUBTITLE'
      ? dialogue.stableId
      : dialogue.lineId
  return `${dialogue.materialId}::${suffix}`
}

async function loadDialogues(client) {
  const { rows } = await client.query(
    `select id, type::text, content_payload
     from materials
     where type in ('LISTENING', 'SPEAKING', 'MEDIA_SUBTITLE')`,
  )
  return rows.flatMap(material =>
    (material.content_payload?.dialogues || []).map((dialogue, index) => {
      const lineId = String(dialogue.id ?? dialogue.sequenceId ?? index + 1)
      return {
        materialId: material.id,
        materialType: material.type,
        lineId,
        stableId: String(dialogue.stableId || lineId),
        text: String(dialogue.text || ''),
        normalizedText: normalizeText(dialogue.text),
      }
    }),
  )
}

function matchSentence(row, dialogues) {
  const ranked = dialogues
    .filter(item => item.lineId === row.oldSourceId)
    .map(item => ({ item, score: similarity(normalizeText(row.text), item.normalizedText) }))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]
  const runnerUp = ranked[1]
  if (!best || best.score < 0.7 || best.score - (runnerUp?.score || 0) < 0.15) {
    return null
  }
  return best.item
}

function matchVocabulary(row, dialogues) {
  const matches = dialogues.filter(
    item => item.lineId === row.oldSourceId && item.text.includes(row.word),
  )
  return matches.length === 1 ? matches[0] : null
}

async function buildReport(client) {
  const dialogues = await loadDialogues(client)
  const plans = []
  for (const [table, textColumn, matcher] of [
    ['Vocabulary', 'word', matchVocabulary],
    ['VocabularySentence', 'text', matchSentence],
    ['SentenceReview', 'text', matchSentence],
  ]) {
    const { rows } = await client.query(
      `select "id", "${textColumn}" as text, "${textColumn}" as word,
              "sourceId" as "oldSourceId"
       from "${table}"
       where "sourceType" = 'AUDIO_DIALOGUE'
         and "sourceId" ~ '^[0-9]+$'`,
    )
    for (const row of rows) {
      const dialogue = matcher(row, dialogues)
      plans.push({
        table,
        rowId: row.id,
        oldSourceId: row.oldSourceId,
        sourceText: row.text,
        newSourceId: dialogue ? sourceIdForDialogue(dialogue) : null,
        newSourceType: dialogue
          ? sourceTypeForMaterial(dialogue.materialType)
          : null,
        matched: Boolean(dialogue),
      })
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    strategy:
      '按旧行号缩小候选范围，并用句子相似度或词条包含关系确定唯一素材。',
    totals: {
      rows: plans.length,
      matched: plans.filter(item => item.matched).length,
      unresolved: plans.filter(item => !item.matched).length,
    },
    mapping: plans,
  }
}

async function applyMigration(client, report) {
  if (report.totals.unresolved > 0) {
    throw new Error(`仍有 ${report.totals.unresolved} 条数字来源无法唯一归属，已取消迁移。`)
  }
  await client.query('begin')
  try {
    for (const row of report.mapping) {
      await client.query(
        `update "${row.table}"
         set "sourceId" = $1, "sourceType" = $2::"SourceType"
         where "id" = $3`,
        [row.newSourceId, row.newSourceType, row.rowId],
      )
    }
    await client.query('commit')
    return { rowsChanged: report.mapping.length }
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
