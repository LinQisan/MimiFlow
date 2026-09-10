import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, SourceType } from '@prisma/client'
import dotenv from 'dotenv'
import JSZip from 'jszip'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5']
const ROOT_TITLE = '红宝书'
const SOURCE_ID_PREFIX = 'red-book'
const AUDIO_WEB_ROOT = '/audios/vocabulary/red-book'

const POS_MAP = {
  A1: 'い形容詞',
  A2: 'な形容詞',
  AV: '副詞',
  D: '畳語',
  '代': '代名詞',
  '连': '連語',
  '尾': '接尾語',
}

const decodeXml = value =>
  String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const extractTextNodes = xml =>
  [...String(xml || '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map(match => decodeXml(match[1]))
    .join('')

export function parseSharedStrings(xml) {
  return [...String(xml || '').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(
    match => extractTextNodes(match[1]),
  )
}

export function parseWorksheetRows(xml, sharedStrings) {
  const rows = []
  for (const rowMatch of String(xml || '').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] || 0)
    const values = {}
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1]
      const body = cellMatch[2] || ''
      const column = attributes.match(/\br="([A-Z]+)/)?.[1]
      if (!column) continue
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || ''
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || ''
      if (type === 's') {
        values[column] = sharedStrings[Number(rawValue)] || ''
      } else if (type === 'inlineStr') {
        values[column] = extractTextNodes(body)
      } else {
        values[column] = decodeXml(rawValue)
      }
    }
    rows.push({ rowNumber, values })
  }
  return rows
}

const clean = value => String(value || '').normalize('NFC').trim()
const comparable = value => clean(value).normalize('NFKC').toLowerCase()
const containsWrittenJapanese = value => /[\u3400-\u9fff々〆ヶ]/u.test(value)

export function resolveHeadword(reading, written) {
  const cleanReading = clean(reading)
  const cleanWritten = clean(written)
  return cleanWritten && containsWrittenJapanese(cleanWritten)
    ? cleanWritten
    : cleanReading
}

export function resolvePartsOfSpeech(values) {
  const sourceCodes = [values.E, values.G, values.H]
  if (values.I === 'り' || values.I === 'と') sourceCodes.push('AV')
  return Array.from(
    new Set(sourceCodes.map(code => POS_MAP[clean(code)]).filter(Boolean)),
  )
}

export function normalizeAudioReference(value) {
  const fileName = clean(value).replace(/\\/g, '/').split('/').pop() || ''
  return fileName.replace(/\.mp4$/i, '.mp3')
}

export function resolveImportedAudio(existingAudio, redBookAudio, sourceOwned) {
  return sourceOwned ? redBookAudio : clean(existingAudio) || redBookAudio
}

const safeAudioName = sourceName => {
  const extension = path.extname(sourceName).toLowerCase() || '.mp3'
  const stem = path.basename(sourceName, path.extname(sourceName))
    .normalize('NFKC')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return `${stem || 'audio'}${extension}`
}

export function buildRedBookRecords(rows) {
  return rows
    .filter(row => row.rowNumber >= 3 && clean(row.values.C) && LEVELS.includes(clean(row.values.X)))
    .map(row => {
      const reading = clean(row.values.C)
      const written = clean(row.values.D)
      const level = clean(row.values.X)
      const sourceAudio = normalizeAudioReference(
        `${row.values.O || ''}${row.values.P || ''}${row.values.Q || ''}` || row.values.R,
      )
      const word = resolveHeadword(reading, written)
      return {
        sourceOrder: Number(row.values.A) || row.rowNumber - 2,
        rowNumber: row.rowNumber,
        level,
        word,
        reading,
        partsOfSpeech: resolvePartsOfSpeech(row.values),
        sourceAudio,
        audioFileName: safeAudioName(sourceAudio),
        key: `${comparable(word)}\u0000${comparable(reading)}`,
      }
    })
}

export function mergeRedBookRecords(records) {
  const merged = new Map()
  for (const record of records) {
    const current = merged.get(record.key)
    if (!current) {
      merged.set(record.key, { ...record, levels: new Set([record.level]) })
      continue
    }
    current.levels.add(record.level)
    current.partsOfSpeech = Array.from(
      new Set([...current.partsOfSpeech, ...record.partsOfSpeech]),
    )
    if (record.sourceOrder < current.sourceOrder) {
      current.sourceOrder = record.sourceOrder
      current.rowNumber = record.rowNumber
      current.level = record.level
      current.sourceAudio = record.sourceAudio
      current.audioFileName = record.audioFileName
    }
  }
  return [...merged.values()].map(record => ({
    ...record,
    levels: LEVELS.filter(level => record.levels.has(level)),
  }))
}

const parseArgument = name => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? clean(process.argv[index + 1]) : ''
}

async function findDefaultSourceRoot() {
  const parent = path.resolve(process.cwd(), '..')
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.normalize('NFKC') !== 'にほんご') continue
    const japaneseRoot = path.join(parent, entry.name)
    for (const child of await readdir(japaneseRoot, { withFileTypes: true })) {
      if (child.isDirectory() && /[红紅]宝书/u.test(child.name)) {
        return path.join(japaneseRoot, child.name)
      }
    }
  }
  throw new Error('找不到にほんご目录下的红宝书资料。')
}

async function fileExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function loadRecords(sourceRoot) {
  const workbookPath = path.join(sourceRoot, '《红宝书》去重版.xlsx')
  const zip = await JSZip.loadAsync(await import('node:fs/promises').then(fs => fs.readFile(workbookPath)))
  const sharedXml = await zip.file('xl/sharedStrings.xml').async('string')
  const worksheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string')
  const rows = parseWorksheetRows(worksheetXml, parseSharedStrings(sharedXml))
  return buildRedBookRecords(rows)
}

const parseJsonList = raw => {
  try {
    const value = JSON.parse(raw || '[]')
    return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
  } catch {
    return []
  }
}

const toJsonList = values => {
  const normalized = Array.from(new Set(values.map(clean).filter(Boolean)))
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

async function copyAudioFiles(records, sourceRoot, apply) {
  const sourceDir = path.join(sourceRoot, '红宝书MP3分割')
  const publicRoot = path.join(process.cwd(), 'public', 'audios', 'vocabulary', 'red-book')
  let copied = 0
  let existing = 0
  const missing = []

  for (let offset = 0; offset < records.length; offset += 32) {
    const batch = records.slice(offset, offset + 32)
    await Promise.all(batch.map(async record => {
      const source = path.join(sourceDir, record.sourceAudio)
      const targetDir = path.join(publicRoot, record.level)
      const target = path.join(targetDir, record.audioFileName)
      if (!(await fileExists(source))) {
        missing.push({ word: record.word, reading: record.reading, source: record.sourceAudio })
        return
      }
      const sourceInfo = await stat(source)
      const targetInfo = await stat(target).catch(() => null)
      if (targetInfo?.size === sourceInfo.size) {
        existing += 1
        return
      }
      if (!apply) {
        copied += 1
        return
      }
      await mkdir(targetDir, { recursive: true })
      await copyFile(source, target)
      copied += 1
    }))
    if (apply && offset > 0 && offset % 512 === 0) {
      process.stdout.write(`[red-book] 音频 ${Math.min(offset + 32, records.length)}/${records.length}\n`)
    }
  }
  return { copied, existing, missing }
}

async function resolveWordbooks(prisma, userId) {
  const series = await prisma.wordbookSeries.upsert({
    where: { userId_title: { userId, title: ROOT_TITLE } },
    update: { sortOrder: 0 },
    create: { userId, title: ROOT_TITLE, sortOrder: 0 },
    select: { id: true },
  })

  const result = new Map()
  for (const [sortOrder, level] of LEVELS.entries()) {
    const wordbook = await prisma.wordbook.upsert({
      where: { seriesId_title: { seriesId: series.id, title: level } },
      update: { sortOrder },
      create: { userId, seriesId: series.id, title: level, sortOrder },
      select: { id: true },
    })
    result.set(level, wordbook.id)
  }
  return result
}

const findExistingVocabulary = (record, candidatesByWord) => {
  const wordKey = comparable(record.word)
  const sameWord = (candidatesByWord.get(wordKey) || [])
    .filter(item => comparable(item.word) === wordKey)
  const exact = sameWord.find(item => {
    const readings = parseJsonList(item.pronunciations)
    return readings.some(reading => comparable(reading) === comparable(record.reading))
  })
  if (exact) return exact
  if (comparable(record.word) === comparable(record.reading)) {
    return sameWord.find(item => parseJsonList(item.pronunciations).length === 0) || null
  }
  return sameWord.length === 1 && parseJsonList(sameWord[0].pronunciations).length === 0
    ? sameWord[0]
    : null
}

async function applyDatabaseImport(prisma, records, userId) {
  const wordbooks = await resolveWordbooks(prisma, userId)
  const existing = await prisma.vocabulary.findMany({
    where: { userId },
    select: {
      id: true,
      word: true,
      wordAudio: true,
      pronunciations: true,
      partsOfSpeech: true,
      sourceId: true,
    },
  })
  const sourceOwnedById = new Map(
    existing
      .filter(item => item.sourceId.startsWith(`${SOURCE_ID_PREFIX}:`))
      .map(item => [item.sourceId, item]),
  )
  const candidatesByWord = new Map()
  for (const candidate of existing) {
    const key = comparable(candidate.word)
    candidatesByWord.set(key, [...(candidatesByWord.get(key) || []), candidate])
  }
  const createdRows = []
  const updates = []
  const vocabularyIdByKey = new Map()

  for (const record of records) {
    const sourceId = `${SOURCE_ID_PREFIX}:${record.level}:${record.sourceOrder}`
    const sourceOwned = sourceOwnedById.get(sourceId) || null
    const matched = sourceOwned || findExistingVocabulary(record, candidatesByWord)
    const pronunciation = comparable(record.word) === comparable(record.reading)
      ? []
      : [record.reading]
    const webAudio = `${AUDIO_WEB_ROOT}/${record.level}/${record.audioFileName}`
    if (matched) {
      vocabularyIdByKey.set(record.key, matched.id)
      const next = sourceOwned
        ? {
            word: record.word,
            pronunciations: toJsonList(pronunciation),
            partsOfSpeech: toJsonList(record.partsOfSpeech),
            wordAudio: resolveImportedAudio(matched.wordAudio, webAudio, true),
          }
        : {
            word: matched.word,
            pronunciations: toJsonList([
              ...parseJsonList(matched.pronunciations),
              ...pronunciation,
            ]),
            partsOfSpeech: toJsonList([
              ...parseJsonList(matched.partsOfSpeech),
              ...record.partsOfSpeech,
            ]),
            // Existing personal audio takes priority; Red Book audio only fills gaps.
            wordAudio: resolveImportedAudio(matched.wordAudio, webAudio, false),
          }
      if (
        next.word !== matched.word ||
        next.pronunciations !== matched.pronunciations ||
        next.partsOfSpeech !== matched.partsOfSpeech ||
        next.wordAudio !== matched.wordAudio
      ) {
        updates.push({ id: matched.id, ...next })
        Object.assign(matched, next)
      }
      continue
    }
    const id = randomUUID()
    const row = {
      id,
      userId,
      word: record.word,
      normalizedWord: record.word.normalize('NFKC').trim().toLocaleLowerCase('ja'),
      sourceType: SourceType.ARTICLE_TEXT,
      sourceId,
      wordAudio: webAudio,
      pronunciations: toJsonList(pronunciation),
      partsOfSpeech: toJsonList(record.partsOfSpeech),
      meanings: null,
    }
    createdRows.push(row)
    const wordKey = comparable(row.word)
    candidatesByWord.set(wordKey, [...(candidatesByWord.get(wordKey) || []), row])
    vocabularyIdByKey.set(record.key, id)
  }

  for (let offset = 0; offset < createdRows.length; offset += 500) {
    await prisma.vocabulary.createMany({ data: createdRows.slice(offset, offset + 500) })
  }
  for (const update of updates) {
    const { id, ...data } = update
    await prisma.vocabulary.update({
      where: { id },
      data: {
        ...data,
        ...(typeof data.word === 'string'
          ? { normalizedWord: data.word.normalize('NFKC').trim().toLocaleLowerCase('ja') }
          : {}),
      },
    })
  }

  const links = []
  for (const record of records) {
    const vocabularyId = vocabularyIdByKey.get(record.key)
    for (const level of record.levels) {
      links.push({
        id: randomUUID(),
        wordbookId: wordbooks.get(level),
        vocabularyId,
        jlpt: level,
        sortOrder: record.sourceOrder,
      })
    }
  }
  const desiredLinkKeys = new Set(
    links.map(link => `${link.wordbookId}\u0000${link.vocabularyId}`),
  )
  const currentLinks = await prisma.wordbookVocabulary.findMany({
    where: { wordbookId: { in: [...wordbooks.values()] } },
    select: { id: true, wordbookId: true, vocabularyId: true },
  })
  const staleLinkIds = currentLinks
    .filter(link => !desiredLinkKeys.has(`${link.wordbookId}\u0000${link.vocabularyId}`))
    .map(link => link.id)
  for (let offset = 0; offset < staleLinkIds.length; offset += 1000) {
    await prisma.wordbookVocabulary.deleteMany({
      where: { id: { in: staleLinkIds.slice(offset, offset + 1000) } },
    })
  }
  let linked = 0
  for (let offset = 0; offset < links.length; offset += 1000) {
    const result = await prisma.wordbookVocabulary.createMany({
      data: links.slice(offset, offset + 1000),
      skipDuplicates: true,
    })
    linked += result.count
  }
  return {
    created: createdRows.length,
    updated: updates.length,
    linked,
    unlinked: staleLinkIds.length,
    linkCandidates: links.length,
  }
}

export async function runRedBookImport() {
  const apply = process.argv.includes('--apply')
  const sourceRoot = path.resolve(parseArgument('--source') || await findDefaultSourceRoot())
  const rawRecords = await loadRecords(sourceRoot)
  const records = mergeRedBookRecords(rawRecords)
  const levelCounts = Object.fromEntries(
    LEVELS.map(level => [level, rawRecords.filter(record => record.level === level).length]),
  )
  const audio = await copyAudioFiles(records, sourceRoot, apply)
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    sourceRoot,
    sourceRows: rawRecords.length,
    uniqueEntries: records.length,
    duplicateLevelLinks: rawRecords.length - records.length,
    levelCounts,
    audio,
    database: null,
  }
  if (!apply) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return report
  }
  if (audio.missing.length > 0) {
    throw new Error(`有 ${audio.missing.length} 条音频无法匹配，已取消数据库导入。`)
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置。')
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
  try {
    const requestedUserId = parseArgument('--user-id')
    const user = requestedUserId
      ? await prisma.user.findUnique({ where: { id: requestedUserId }, select: { id: true } })
      : await prisma.user.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } })
    if (!user) throw new Error('找不到可用用户。')
    report.database = await applyDatabaseImport(prisma, records, user.id)
    report.userId = user.id
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return report
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runRedBookImport()
}
