'use server'

import { requireAdmin } from '@/modules/users/server/current-user'

import { persistImportedWordbookOrder } from '@/modules/knowledge/wordbooks/entry-order-writer'
import { ensureAnkiVocabularySenses } from '@/modules/import/server/anki-vocabulary'
import { changedAnkiFields, planAnkiReadingAudio } from '@/modules/import/domain/anki-reading-audio'
import { normalizeAnkiGroupTitle, preferredAnkiAudio } from '@/modules/import/domain/anki-vocabulary'
import { Prisma, SourceType } from '@prisma/client'
import { mkdir, readFile, stat, writeFile, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { revalidatePath, updateTag } from 'next/cache'
import { VOCABULARY_GROUPS_CACHE_TAG } from '@/modules/knowledge/vocabulary/server/repository'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import {
  mergeVocabularyPronunciations,
  sanitizePronunciations,
} from '@/utils/text/pronunciation'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabulary/vocabularyCanonical'
import { buildVocabularyAudioFolder } from '@/utils/vocabulary/audioFolder'
import {
  filterVocabularyTags,
  inferVocabularyJlpt,
  normalizeVocabularyJlpt,
} from '@/modules/knowledge/vocabulary/domain/jlpt'
import { resolvePathInsideRoot } from '@/utils/files/path'
import { PUBLIC_AUDIO_ROOT } from '@/lib/server/public-paths'
import { AUDIO_EXTENSIONS } from '@/modules/media/audio/domain/storage'
import {
  batchComputeVocabularyPronunciations,
  batchComputeSentencePronunciations,
} from '@/modules/knowledge/vocabulary/server/pronunciation-service'
import { PRONUNCIATION_VERSION } from '@/modules/knowledge/vocabulary/domain/pronunciation'
import { hasJapanese } from '@/modules/language/domain/text'
import {
  parseAnkiPackage,
  type AnkiPackageNote,
  type ParsedAnkiPackage,
} from '@/modules/import/server/anki-package'
import {
  resolveAnkiNotebookPath,
} from '@/modules/import/domain/anki-package'
import { inferStructuredPartOfSpeech } from '@/modules/knowledge/vocabulary/domain/entry'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'

import { splitJapaneseEtymologies } from '@/modules/language/domain/etymology'

type ParsedRow = {
  rowNo: number
  word: string
  wordAudioRaw: string
  wordAudioName: string
  etymologies?: string[]
  pronunciations: string[]
  meanings: string[]
  sentence: string
  sentenceTranslation: string
  sentenceAudioRaw: string
  sentenceAudioName: string
  usage: string
  tags: string[]
}

type PreviewRow = {
  etymologies?: string[]
  rowNo: number
  word: string
  wordAudioName: string
  sentence: string
  sentenceTranslation: string
  sentenceAudioName: string
  tags: string[]
  status: 'valid' | 'skipped'
  reason?: string
}

const MAX_PREVIEW_ROWS = 24
const MAX_IMPORT_ROWS = 5000
const TAG_BATCH_SIZE = 1_000
const AUDIO_ROOT = PUBLIC_AUDIO_ROOT

const WORD_HEADERS = new Set(['word', '单词', '詞', '単語'])
const ETYMOLOGY_HEADERS = new Set(['etymology', 'etymologies', 'origin', '词源', '語源'])
const PRON_HEADERS = new Set([
  'pronunciation',
  'pronunciations',
  '注音',
  '读音',
  '読み',
  'ふりがな',
  '假名',
])
const WORD_AUDIO_HEADERS = new Set([
  'word_audio',
  'audio_word',
  'word audio',
  '单词音频',
  '单词发音',
  '词音频',
])
const MEANING_HEADERS = new Set([
  'meaning',
  'meanings',
  '释义',
  '中文释义',
  '翻译',
  '意味',
])
const SENTENCE_HEADERS = new Set(['example', 'sentence', '例句', '例文'])
const SENTENCE_TRANSLATION_HEADERS = new Set([
  'sentence_translation',
  'example_translation',
  '例句翻译',
  '例句中文',
  '例文翻訳',
  'sentence meaning',
])
const SENTENCE_AUDIO_HEADERS = new Set([
  'sentence_audio',
  'example_audio',
  '句子音频',
  '例句音频',
  '例句发音',
  '音频',
  'audio',
])
const TAG_HEADERS = new Set(['tags', 'tag', '标签', '標籤', 'anki tags'])

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')

const isApkgFile = (file: File) => /\.apkg$/i.test(file.name)

const stripHtml = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()

const splitList = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，;；|]+/)
        .map(item => stripHtml(item))
        .filter(Boolean),
    ),
  )

const parseMeanings = (value: string) => {
  const meaning = stripHtml(value)
  return meaning ? [meaning] : []
}

const parseSoundTag = (value: string) => {
  const m = value.match(/\[sound:([^\]]+)\]/i)
  if (m?.[1]) return m[1].trim()
  return ''
}

const parseTsvRecords = (content: string) => {
  const rows: { cells: string[]; rowNo: number }[] = []
  let cells: string[] = []
  let current = ''
  let inQuotes = false
  let rowNo = 1
  let cellStartRow = 1

  const pushCell = () => {
    cells.push(current)
    current = ''
  }
  const pushRow = () => {
    rows.push({ cells, rowNo: cellStartRow })
    cells = []
    cellStartRow = rowNo
  }

  const text = content.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && ch === '\t') {
      pushCell()
      continue
    }

    if (!inQuotes && ch === '\n') {
      pushCell()
      pushRow()
      rowNo += 1
      continue
    }

    if (!inQuotes && ch === '\r') {
      if (next === '\n') {
        pushCell()
        pushRow()
        rowNo += 1
        i += 1
      } else {
        pushCell()
        pushRow()
        rowNo += 1
      }
      continue
    }

    current += ch
  }

  if (current.length > 0 || cells.length > 0) {
    pushCell()
    pushRow()
  }

  return rows.filter(item => item.cells.some(cell => cell.trim().length > 0))
}

const parseTsv = (content: string) => {
  const records = parseTsvRecords(content)
  if (records.length === 0) return { rows: [], missingHeaders: ['word', 'example'] }

  const dataRecords = records.filter(record => {
    const first = String(record.cells[0] || '').trim()
    return !(first.startsWith('#') || first.startsWith('//'))
  })
  if (dataRecords.length === 0) return { rows: [], missingHeaders: ['word', 'example'] }

  const headers = dataRecords[0].cells.map(cell => normalizeHeader(cell))
  const findIndex = (headerSet: Set<string>) =>
    headers.findIndex(h => Array.from(headerSet).some(c => normalizeHeader(c) === h))

  const wordIdx = findIndex(WORD_HEADERS)
  const pronIdx = findIndex(PRON_HEADERS)
  const wordAudioIdx = findIndex(WORD_AUDIO_HEADERS)
  const meaningIdx = findIndex(MEANING_HEADERS)
  const sentenceIdx = findIndex(SENTENCE_HEADERS)
  const sentenceTranslationIdx = findIndex(SENTENCE_TRANSLATION_HEADERS)
  const sentenceAudioIdx = findIndex(SENTENCE_AUDIO_HEADERS)
  const tagsIdx = findIndex(TAG_HEADERS)
  const etymologyIdx = findIndex(ETYMOLOGY_HEADERS)
  const usageIdx = headers.findIndex(h =>
    ['usage', '用法', 'note', 'notes', '备注', 'メモ'].includes(h),
  )

  const missingHeaders: string[] = []
  if (wordIdx < 0) missingHeaders.push('word/单词')

  const rows: ParsedRow[] = []

  for (let i = 1; i < dataRecords.length; i += 1) {
    const record = dataRecords[i]
    const cells = record.cells
    const word = stripHtml(cells[wordIdx] || '')
    const sentence = stripHtml(cells[sentenceIdx] || '')
    const etymologies = etymologyIdx >= 0 ? splitList(cells[etymologyIdx] || '') : []
    const pronunciations = pronIdx >= 0 ? splitList(cells[pronIdx] || '') : []
    const wordAudioRaw = wordAudioIdx >= 0 ? (cells[wordAudioIdx] || '').trim() : ''
    const wordAudioName = parseSoundTag(wordAudioRaw) || wordAudioRaw
    const meanings = meaningIdx >= 0 ? parseMeanings(cells[meaningIdx] || '') : []
    const sentenceTranslation =
      sentenceTranslationIdx >= 0 ? stripHtml(cells[sentenceTranslationIdx] || '') : ''
    const usage = usageIdx >= 0 ? stripHtml(cells[usageIdx] || '') : ''
    const tags = tagsIdx >= 0 ? splitList(cells[tagsIdx] || '') : []
    const sentenceAudioRaw = sentenceAudioIdx >= 0 ? (cells[sentenceAudioIdx] || '').trim() : ''
    const sentenceAudioName = parseSoundTag(sentenceAudioRaw) || sentenceAudioRaw

    rows.push({
      rowNo: record.rowNo,
      word,
      wordAudioRaw,
      wordAudioName: path.basename(wordAudioName || '').trim(),
      pronunciations,
      etymologies,
      meanings,
      sentence,
      sentenceTranslation,
      sentenceAudioRaw,
      sentenceAudioName: path.basename(sentenceAudioName || '').trim(),
      usage,
      tags,
    })
  }

  return { rows, missingHeaders }
}

const findAnkiField = (note: AnkiPackageNote, names: Set<string>) => {
  const match = Object.entries(note.fields).find(([name]) =>
    names.has(normalizeHeader(name)),
  )
  return match?.[1] || ''
}

const parseAnkiPackageRows = (notes: AnkiPackageNote[]) => {
  const rows = notes.map<ParsedRow>(note => {
    const word = stripHtml(findAnkiField(note, WORD_HEADERS))
    const sentence = stripHtml(findAnkiField(note, SENTENCE_HEADERS))
    const wordAudioRaw = findAnkiField(note, WORD_AUDIO_HEADERS).trim()
    const sentenceAudioRaw = findAnkiField(note, SENTENCE_AUDIO_HEADERS).trim()
    const wordAudioName = parseSoundTag(wordAudioRaw) || wordAudioRaw
    const sentenceAudioName = parseSoundTag(sentenceAudioRaw) || sentenceAudioRaw
    return {
      rowNo: note.rowNo,
      word,
      wordAudioRaw,
      wordAudioName: path.basename(wordAudioName || '').trim(),
      pronunciations: splitList(findAnkiField(note, PRON_HEADERS)),
      etymologies: splitList(findAnkiField(note, ETYMOLOGY_HEADERS)),
      meanings: parseMeanings(findAnkiField(note, MEANING_HEADERS)),
      sentence,
      sentenceTranslation: stripHtml(
        findAnkiField(note, SENTENCE_TRANSLATION_HEADERS),
      ),
      sentenceAudioRaw,
      sentenceAudioName: path.basename(sentenceAudioName || '').trim(),
      usage: stripHtml(
        findAnkiField(
          note,
          new Set(['usage', '用法', 'note', 'notes', '备注', 'メモ']),
        ),
      ),
      tags: note.tags,
    }
  })
  const missingHeaders: string[] = []
  if (notes.length > 0 && rows.every(row => !row.word)) {
    missingHeaders.push('word/单词')
  }
  return { rows, missingHeaders }
}

const readImportFile = async (file: File) => {
  if (!isApkgFile(file)) {
    const parsed = parseTsv(await file.text())
    return {
      ...parsed,
      fileKind: 'tsv' as const,
      ankiPackage: null as ParsedAnkiPackage | null,
    }
  }
  const ankiPackage = await parseAnkiPackage(
    Buffer.from(await file.arrayBuffer()),
    file.name,
  )
  return {
    ...parseAnkiPackageRows(ankiPackage.notes),
    fileKind: 'apkg' as const,
    ankiPackage,
  }
}

const toEmbeddedAudioFiles = (ankiPackage: ParsedAnkiPackage | null) =>
  (ankiPackage?.audioFiles || []).map(
    item =>
      new File([new Uint8Array(item.data)], item.name, {
        type: path.extname(item.name).toLowerCase() === '.mp3'
          ? 'audio/mpeg'
          : 'application/octet-stream',
      }),
  )

const mergeAudioFiles = (embeddedFiles: File[], pickedFiles: File[]) => {
  const filesByName = new Map<string, File>()
  embeddedFiles.forEach(file => filesByName.set(path.basename(file.name), file))
  pickedFiles.forEach(file => filesByName.set(path.basename(file.name), file))
  return [...filesByName.values()]
}

const normalizeSentenceKey = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s([{【（]*\d+[\]).】、．\s-]*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const normalizeAudioLookupKey = (name: string) =>
  path
    .basename(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

const safeFileName = (name: string) =>
  name
    .normalize('NFKC')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)

async function audioFileExists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

const normalizeFolderSegments = (value: string) =>
  value
    .replace(/\\/g, '/')
    .split('/')
    .map(item => item.trim())
    .filter(Boolean)

const resolveWordbookPath = async (rawPath: string, userId: string, prisma: Prisma.TransactionClient) => {
  const segments = normalizeFolderSegments(rawPath)
  if (segments.length === 0) return null
  if (segments.length !== 2) {
    throw new Error('请同时填写分组和词表名称。')
  }
  const [seriesTitle, wordbookTitle] = segments
  const candidates = await prisma.wordbookSeries.findMany({ where: { userId }, select: { id: true, title: true, _count: { select: { wordbooks: true } } } })
  const existingSeries = candidates.filter(item => normalizeAnkiGroupTitle(item.title) === normalizeAnkiGroupTitle(seriesTitle)).sort((a, b) => b._count.wordbooks - a._count.wordbooks)[0]
  const series = existingSeries || await prisma.wordbookSeries.upsert({
    where: { userId_title: { userId, title: seriesTitle } },
    update: {},
    create: { userId, title: seriesTitle },
    select: { id: true },
  })
  const wordbook = await prisma.wordbook.upsert({
    where: {
      seriesId_title: { seriesId: series.id, title: wordbookTitle },
    },
    update: {},
    create: { userId, seriesId: series.id, title: wordbookTitle },
    select: { id: true },
  })
  return wordbook.id
}

const resolveVocabularyTagIds = async (tagNames: string[], userId: string, prisma: Prisma.TransactionClient) => {
  const uniqueNames = Array.from(
    new Set(tagNames.map(item => item.trim()).filter(Boolean)),
  )
  if (uniqueNames.length === 0) return new Map<string, string>()
  const batches = Array.from(
    { length: Math.ceil(uniqueNames.length / TAG_BATCH_SIZE) },
    (_, index) => uniqueNames.slice(
      index * TAG_BATCH_SIZE,
      (index + 1) * TAG_BATCH_SIZE,
    ),
  )
  for (const names of batches) {
    await prisma.vocabularyTag.createMany({
      data: names.map(name => ({ userId, name })),
      skipDuplicates: true,
    })
  }
  const tags = (
    await Promise.all(
      batches.map(names =>
        prisma.vocabularyTag.findMany({
          where: { userId, name: { in: names } },
          select: { id: true, name: true },
        }),
      ),
    )
  ).flat()
  return new Map(tags.map(tag => [tag.name, tag.id]))
}

const createPreviewRows = (rows: ParsedRow[]): PreviewRow[] =>
  rows.slice(0, MAX_PREVIEW_ROWS).map(row => {
    if (!row.word) {
      return {
        rowNo: row.rowNo,
        word: '',
        wordAudioName: row.wordAudioName,
        sentence: row.sentence,
        sentenceTranslation: row.sentenceTranslation,
        sentenceAudioName: row.sentenceAudioName,
        tags: filterVocabularyTags(row.tags),
        status: 'skipped',
        reason: '缺少单词',
      }
    }
    return {
      rowNo: row.rowNo,
      word: row.word,
      etymologies: splitJapaneseEtymologies(row.word, row.pronunciations, row.etymologies).etymologies,
      wordAudioName: row.wordAudioName,
      sentence: row.sentence,
      sentenceTranslation: row.sentenceTranslation,
      sentenceAudioName: row.sentenceAudioName,
      tags: filterVocabularyTags(row.tags),
      status: 'valid',
    }
  })

const parseRowsJson = (raw: string): ParsedRow[] => {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => ({
        rowNo: Number(item.rowNo) || 0,
        word: String(item.word || '').trim(),
        wordAudioRaw: String(item.wordAudioRaw || '').trim(),
        wordAudioName: String(item.wordAudioName || '').trim(),
        etymologies: Array.isArray(item.etymologies) ? item.etymologies.map((x: unknown) => String(x || '').trim()).filter(Boolean) : [],
        pronunciations: Array.isArray(item.pronunciations)
          ? item.pronunciations.map((x: unknown) => String(x || '').trim()).filter(Boolean)
          : [],
        meanings: Array.isArray(item.meanings)
          ? item.meanings.map((x: unknown) => String(x || '').trim()).filter(Boolean)
          : [],
        sentence: String(item.sentence || '').trim(),
        sentenceTranslation: String(item.sentenceTranslation || '').trim(),
        sentenceAudioRaw: String(item.sentenceAudioRaw || '').trim(),
        sentenceAudioName: String(item.sentenceAudioName || '').trim(),
        usage: String(item.usage || '').trim(),
        tags: Array.isArray(item.tags)
          ? item.tags.map((x: unknown) => String(x || '').trim()).filter(Boolean)
          : [],
      }))
      .filter(item => item.rowNo > 0)
      .slice(0, MAX_IMPORT_ROWS)
  } catch {
    return []
  }
}

async function uploadAudioFiles(files: File[], folderInput: string, createdPaths: string[]) {
  const folder = folderInput
    .replace(/\\/g, '/')
    .split('/')
    .map(segment =>
      segment
        .normalize('NFKC')
        .trim()
        .replace(/[<>:"|?*\u0000-\u001F]/g, ''),
    )
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('/')

  const resolvedFolder = folder
  if (!resolvedFolder) {
    throw new Error('请先选择词书分组和词表。')
  }
  const targetDir = resolvePathInsideRoot(AUDIO_ROOT, resolvedFolder)
  if (!targetDir) {
    throw new Error('音频目录无效。')
  }
  await mkdir(targetDir, { recursive: true })

  const map = new Map<string, string>()

  for (const file of files) {
    if (!file || file.size === 0) continue
    const ext = path.extname(file.name).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) continue

    const safe = safeFileName(path.basename(file.name, ext)) || 'audio'
    let finalName = `${safe}${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    let suffix = 2
    while (await audioFileExists(path.join(targetDir, finalName))) {
      if ((await readFile(path.join(targetDir, finalName))).equals(bytes)) break
      finalName = `${safe}-${suffix}${ext}`
      suffix += 1
    }
    const abs = path.join(targetDir, finalName)
    try { await writeFile(abs, bytes, { flag: 'wx' }); createdPaths.push(abs) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readFile(abs)).equals(bytes)) throw error
    }

    const webPath = `/audios/${resolvedFolder}/${finalName}`.replace(/\/+/g, '/')
    const originalBase = path.basename(file.name)
    map.set(originalBase, webPath)
    map.set(normalizeAudioLookupKey(originalBase), webPath)
  }

  return map
}

export async function previewAnkiImport(formData: FormData) {
  await requireAdmin()
  const userId = await getCurrentUserId()
  const importFile = (formData.get('ankiFile') || formData.get('tsvFile')) as
    | File
    | null
  if (!importFile || importFile.size === 0) {
    return { success: false, message: '请先选择 Anki APKG、TXT 或 TSV 文件。' }
  }

  let importSource: Awaited<ReturnType<typeof readImportFile>>
  try {
    importSource = await readImportFile(importFile)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '无法解析 Anki 文件。',
    }
  }
  const { rows, missingHeaders, ankiPackage, fileKind } = importSource

  if (missingHeaders.length > 0) {
    return {
      success: false,
      message: `缺少必要字段：${missingHeaders.join('、')}`,
    }
  }

  const truncatedRows = rows.slice(0, MAX_IMPORT_ROWS)
  const validRows = truncatedRows.filter(item => item.word)

  const uniqueWords = Array.from(new Set(validRows.map(item => item.word)))
  const requestedNotebookName = String(
    formData.get('notebookName') || '',
  ).trim()
  let notebookName =
    requestedNotebookName || ankiPackage?.suggestedNotebookName || ''
  const wordbookId = String(formData.get('wordbookId') || '').trim()
  const seriesId = String(formData.get('seriesId') || '').trim()
  const requestedWordbookTitle = String(
    formData.get('wordbookTitle') || '',
  ).trim()
  const requestedSeriesTitle = String(
    formData.get('seriesTitle') || '',
  ).trim()
  const [existingWords, selectedWordbook, selectedSeries] = await Promise.all([
    prisma.vocabulary.findMany({
      where: { userId, word: { in: uniqueWords } },
      select: { word: true },
    }),
    wordbookId
      ? prisma.wordbook.findFirst({
          where: { id: wordbookId, userId },
          select: { title: true, series: { select: { title: true } } },
        })
      : Promise.resolve(null),
    seriesId
      ? prisma.wordbookSeries.findFirst({
          where: { id: seriesId, userId },
          select: { title: true },
        })
      : Promise.resolve(null),
  ])
  if (wordbookId && !selectedWordbook) {
    return { success: false, message: '目标词表不存在或已不可用，请重新选择。' }
  }
  if (seriesId && !selectedSeries) {
    return { success: false, message: '所选分组不存在或已不可用，请重新选择。' }
  }
  const resolvedTarget = resolveAnkiNotebookPath({
    requestedNotebookName,
    suggestedNotebookName: ankiPackage?.suggestedNotebookName,
    requestedSeriesTitle,
    requestedWordbookTitle,
    selectedSeriesTitle: selectedSeries?.title,
  })
  if (!wordbookId) notebookName = resolvedTarget.notebookName
  const existingWordSet = new Set(existingWords.map(item => item.word))

  const pickedAudioFiles = (formData.getAll('audioFiles') as File[]).filter(
    file => file?.size > 0,
  )
  const embeddedAudioFiles = toEmbeddedAudioFiles(ankiPackage)
  const audioFiles = mergeAudioFiles(embeddedAudioFiles, pickedAudioFiles)
  if (!wordbookId && !notebookName) {
    return {
      success: false,
      message: '请同时填写分组和词表名称。',
    }
  }
  const wordbookTitle = selectedWordbook?.title || ''
  const notebookParts = normalizeFolderSegments(notebookName)
  const sourceName = wordbookTitle || notebookParts[1] || selectedWordbook?.series.title || notebookParts[0] || ''
  const globalTags = splitList(String(formData.get('globalTags') || ''))
  const uploadNameSet = new Set([
    ...audioFiles.map(file => path.basename(file.name)),
    ...audioFiles.map(file => normalizeAudioLookupKey(file.name)),
  ])

  const rowsWithAudioRef = validRows.filter(item => item.sentenceAudioName).length
  const rowsWithWordAudioRef = validRows.filter(item => item.wordAudioName).length
  const matchedAudioRows = validRows.filter(
    item =>
      item.sentenceAudioName &&
      (uploadNameSet.has(item.sentenceAudioName) ||
        uploadNameSet.has(normalizeAudioLookupKey(item.sentenceAudioName))),
  ).length
  const matchedWordAudioRows = validRows.filter(
    item =>
      item.wordAudioName &&
      (uploadNameSet.has(item.wordAudioName) ||
        uploadNameSet.has(normalizeAudioLookupKey(item.wordAudioName))),
  ).length

  return {
    success: true,
    preview: {
      totalRows: truncatedRows.length,
      validRows: validRows.length,
      skippedRows: truncatedRows.length - validRows.length,
      createWords: validRows.filter(item => !existingWordSet.has(item.word)).length,
      updateWords: validRows.filter(item => existingWordSet.has(item.word)).length,
      rowsWithAudioRef,
      rowsWithWordAudioRef,
      matchedAudioRows,
      matchedWordAudioRows,
      uploadedAudioFiles: audioFiles.length,
      notebookName,
      wordbookId,
      wordbookTitle,
      sourceName,
      fileKind,
      deckNames: ankiPackage?.deckNames || [],
      embeddedAudioFiles: embeddedAudioFiles.length,
      globalTags: globalTags.join(' / '),
      sampleRows: createPreviewRows(truncatedRows),
      rowsJson: JSON.stringify(validRows),
    },
  }
}

export async function runAnkiImport(formData: FormData) {
  await requireAdmin()
  const userId = await getCurrentUserId()
  const rowsJson = String(formData.get('rowsJson') || '')
  const notebookName = String(formData.get('notebookName') || '').trim()
  const selectedWordbookId = String(formData.get('wordbookId') || '').trim()
  const selectedSeriesId = String(formData.get('seriesId') || '').trim()
  const requestedSeriesTitle = String(
    formData.get('seriesTitle') || '',
  ).trim()
  const requestedWordbookTitle = String(
    formData.get('wordbookTitle') || '',
  ).trim()
  const globalTags = splitList(String(formData.get('globalTags') || ''))
  const rawRequestedJlpt = String(formData.get('jlpt') || '').trim()
  const requestedJlpt = normalizeVocabularyJlpt(rawRequestedJlpt)
  if (rawRequestedJlpt && !requestedJlpt) {
    return { success: false as const, message: 'JLPT 只能是 N1–N5。' }
  }
  const sharedPartsOfSpeech = splitList(
    String(formData.get('partsOfSpeech') || ''),
  )
  const rows = parseRowsJson(rowsJson)
  if (rows.length === 0) {
    return { success: false as const, message: '没有可导入的数据。请先预览。' }
  }

  const pickedAudioFiles = (formData.getAll('audioFiles') as File[]).filter(
    file => file?.size > 0,
  )
  const importFile = (formData.get('ankiFile') || formData.get('tsvFile')) as
    | File
    | null
  let embeddedAudioFiles: File[] = []
  if (importFile && importFile.size > 0 && isApkgFile(importFile)) {
    try {
      const ankiPackage = await parseAnkiPackage(
        Buffer.from(await importFile.arrayBuffer()),
        importFile.name,
      )
      embeddedAudioFiles = toEmbeddedAudioFiles(ankiPackage)
    } catch (error) {
      return {
        success: false as const,
        message:
          error instanceof Error ? error.message : '无法读取 APKG 内置音频。',
      }
    }
  }
  const uniqueWordsToAnalyze = Array.from(
    new Set(rows.map(r => r.word.trim()).filter(w => w && hasJapanese(w))),
  )
  const uniqueSentencesToAnalyze = Array.from(
    new Set(rows.map(r => r.sentence.trim()).filter(s => s && hasJapanese(s))),
  )
  const [wordPronMap, sentencePronMap] = await Promise.all([
    uniqueWordsToAnalyze.length > 0
      ? batchComputeVocabularyPronunciations(uniqueWordsToAnalyze).catch(() => new Map())
      : Promise.resolve(new Map()),
    uniqueSentencesToAnalyze.length > 0
      ? batchComputeSentencePronunciations(uniqueSentencesToAnalyze).catch(() => new Map())
      : Promise.resolve(new Map()),
  ])

  const createdAudioPaths: string[] = []
  try {
    const result = await prisma.$transaction(async tx => {
      const prisma = tx
  const audioFiles = mergeAudioFiles(embeddedAudioFiles, pickedAudioFiles)
  const [selectedWordbook, selectedSeries] = await Promise.all([
    selectedWordbookId
      ? prisma.wordbook.findFirst({
          where: { id: selectedWordbookId, userId },
          select: {
            id: true,
            title: true,
            series: { select: { title: true } },
          },
        })
      : Promise.resolve(null),
    selectedSeriesId
      ? prisma.wordbookSeries.findFirst({
          where: { id: selectedSeriesId, userId },
          select: { id: true, title: true },
        })
      : Promise.resolve(null),
  ])
  if (selectedWordbookId && !selectedWordbook) {
    throw new Error('目标词表不存在或已不可用，请重新选择。')
  }
  if (selectedSeriesId && !selectedSeries) {
    throw new Error('所选分组不存在或已不可用，请重新选择。')
  }
  const resolvedTarget = resolveAnkiNotebookPath({
    requestedNotebookName: notebookName,
    requestedSeriesTitle,
    requestedWordbookTitle,
    selectedSeriesTitle: selectedSeries?.title,
  })
  let resolvedNotebookName = resolvedTarget.notebookName
  const targetTitle = selectedWordbook?.title || resolvedTarget.wordbookTitle
  let targetWordbookId: string | null = selectedWordbook?.id || null
  if (!selectedWordbookId && selectedSeries) {
    if (!targetTitle) {
      throw new Error('请填写词表名称。')
    }
    const targetWordbook = await prisma.wordbook.upsert({
      where: {
        seriesId_title: { seriesId: selectedSeries.id, title: targetTitle },
      },
      update: {},
      create: {
        userId,
        seriesId: selectedSeries.id,
        title: targetTitle,
      },
      select: { id: true },
    })
    targetWordbookId = targetWordbook.id
    resolvedNotebookName = `${selectedSeries.title}/${targetTitle}`
  } else if (!selectedWordbookId && resolvedNotebookName) {
    try {
      targetWordbookId = await resolveWordbookPath(resolvedNotebookName, userId, prisma)
    } catch (error) {
      throw error
    }
  } else if (!selectedWordbookId) {
    throw new Error('请同时填写分组和词表名称。')
  }
  const resolvedNotebookParts = normalizeFolderSegments(resolvedNotebookName)
  const targetSeriesTitle =
    selectedWordbook?.series.title ||
    selectedSeries?.title ||
    resolvedNotebookParts[0] ||
    ''
  const sourceName = targetTitle || resolvedNotebookParts[1] || targetSeriesTitle
  const audioFolder = buildVocabularyAudioFolder(
    targetSeriesTitle,
    targetTitle || resolvedNotebookParts[1] || '',
  )
  if (!audioFolder) {
    throw new Error('无法生成词表音频目录。')
  }
  const sentenceSourceUrl = targetWordbookId
    ? `/vocabulary/wordbooks/${targetWordbookId}`
    : '/manage/import?language=ja&scope=vocabulary&type=anki'
  const audioMap = await uploadAudioFiles(audioFiles, audioFolder, createdAudioPaths)
  const wordbookJlpt =
    requestedJlpt ||
    globalTags.map(normalizeVocabularyJlpt).find(Boolean) ||
    inferVocabularyJlpt(targetSeriesTitle, targetTitle)
  const vocabularyTags = filterVocabularyTags([
    ...globalTags,
    ...rows.flatMap(row => row.tags),
  ])
  const tagIdByName = await resolveVocabularyTagIds(
    vocabularyTags,
    userId,
    prisma,
  )
  const globalTagIds = filterVocabularyTags(globalTags).flatMap(name => {
    const id = tagIdByName.get(name)
    return id ? [id] : []
  })

  let created = 0
  let updated = 0
  let linkedSentences = 0
  const allVocabularies = await prisma.vocabulary.findMany({
    where: { userId },
    select: {
      id: true,
      word: true,
      pronunciations: true,
      etymologies: true,
      partsOfSpeech: true,
      wordAudio: true,
      senses: {
        orderBy: { order: 'asc' },
        select: {
          definitions: { select: { definition: true } },
        },
      },
    },
  })
  const vocabularyByExactWord = new Map<string, (typeof allVocabularies)[number]>()
  const vocabularyIndexesByCanonicalKey = new Map<string, number[]>()
  const indexVocabulary = (
    vocabulary: (typeof allVocabularies)[number],
    index: number,
  ) => {
    if (!vocabularyByExactWord.has(vocabulary.word)) {
      vocabularyByExactWord.set(vocabulary.word, vocabulary)
    }
    buildVocabularyCanonicalKeys(vocabulary.word).forEach(key => {
      const indexes = vocabularyIndexesByCanonicalKey.get(key)
      if (indexes) indexes.push(index)
      else vocabularyIndexesByCanonicalKey.set(key, [index])
    })
  }
  allVocabularies.forEach(indexVocabulary)
  const pendingReadingAudios = new Map<string, { vocabularyId: string; reading: string; audioFile: string }>()
  const pendingWordbookEntries = new Map<string, string | null>()
  const pendingTagLinks = new Map<string, { vocabularyId: string; tagId: string }>()

  for (const row of rows) {
    if (!row.word) continue

    let existing = vocabularyByExactWord.get(row.word) || null
    if (!existing) {
      const targetKeys = new Set(buildVocabularyCanonicalKeys(row.word))
      if (targetKeys.size > 0) {
        let best: (typeof allVocabularies)[number] | null = null
        let bestScore = -1
        const candidateIndexes = Array.from(
          new Set(
            [...targetKeys].flatMap(
              key => vocabularyIndexesByCanonicalKey.get(key) || [],
            ),
          ),
        ).sort((left, right) => left - right)
        for (const candidateIndex of candidateIndexes) {
          const candidate = allVocabularies[candidateIndex]
          if (!candidate) continue
          const candidateKeys = buildVocabularyCanonicalKeys(candidate.word)
          const intersectCount = candidateKeys.filter(key => targetKeys.has(key)).length
          if (intersectCount === 0) continue
          const lengthScore = Math.max(0, 6 - Math.abs(candidate.word.length - row.word.length))
          const score = intersectCount * 10 + lengthScore
          if (!best || score > bestScore) {
            best = candidate
            bestScore = score
          }
        }
        existing = best
      }
    }
    const classified = splitJapaneseEtymologies(row.word, row.pronunciations, row.etymologies)
    const normalizedPronunciations = sanitizePronunciations(row.word, classified.pronunciations)

    const wordAudioPath = row.wordAudioName
      ? audioMap.get(row.wordAudioName) ||
        audioMap.get(normalizeAudioLookupKey(row.wordAudioName)) ||
        (row.wordAudioName.startsWith('/audios/') ? row.wordAudioName : '')
      : ''

    let vocabularyId = ''
    const wordPronData = wordPronMap.get(row.word.trim()) || null
    if (!existing) {
      const createdVocab = await prisma.vocabulary.create({
        data: {
          userId,
          word: row.word,
          normalizedWord: normalizeVocabularyWord(row.word),
          sourceType: SourceType.ARTICLE_TEXT,
          sourceId: 'anki-import',
          wordAudio: wordAudioPath || null,
          pronunciations: toJsonStringList(normalizedPronunciations),
          etymologies: toJsonStringList(classified.etymologies),
          partsOfSpeech: toJsonStringList(sharedPartsOfSpeech),
          grammarPartOfSpeech: inferStructuredPartOfSpeech(sharedPartsOfSpeech),
          pronunciationData: wordPronData
            ? (wordPronData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          pronunciationVersion: wordPronData ? PRONUNCIATION_VERSION : null,
        },
        select: { id: true },
      })
      allVocabularies.push({
        id: createdVocab.id,
        word: row.word,
        pronunciations: toJsonStringList(normalizedPronunciations),
        etymologies: toJsonStringList(classified.etymologies),
        partsOfSpeech: toJsonStringList(sharedPartsOfSpeech),
        wordAudio: wordAudioPath || null,
        senses: [],
      })
      indexVocabulary(
        allVocabularies[allVocabularies.length - 1],
        allVocabularies.length - 1,
      )
      vocabularyId = createdVocab.id
      created += 1
    } else {
      const existingReadings = splitJapaneseEtymologies(row.word, parseJsonStringList(existing.pronunciations), parseJsonStringList(existing.etymologies))
      const mergedEtymologies = toJsonStringList(splitJapaneseEtymologies(row.word, [], [...existingReadings.etymologies, ...classified.etymologies]).etymologies)
      const mergedPron = toJsonStringList(
        mergeVocabularyPronunciations({
          word: row.word,
          existing: existingReadings.pronunciations,
          incoming: normalizedPronunciations,
          preferIncoming: false,
        }),
      )
      const mergedPartsOfSpeech = toJsonStringList([
        ...parseJsonStringList(existing.partsOfSpeech),
        ...sharedPartsOfSpeech,
      ])

      const changes = changedAnkiFields(existing, {
        wordAudio: preferredAnkiAudio(existing.wordAudio, wordAudioPath),
        pronunciations: mergedPron,
        etymologies: mergedEtymologies,
        partsOfSpeech: mergedPartsOfSpeech,
      })
      if (Object.keys(changes).length) {
        await prisma.vocabulary.update({ where: { id: existing.id }, data: changes })
        updated += 1
      }
      const idx = allVocabularies.findIndex(item => item.id === existing!.id)
      if (idx >= 0) {
        allVocabularies[idx] = {
          ...allVocabularies[idx],
          pronunciations: mergedPron,
          etymologies: mergedEtymologies,
          partsOfSpeech: mergedPartsOfSpeech,
          wordAudio: preferredAnkiAudio(allVocabularies[idx].wordAudio, wordAudioPath),
        }
      }
      if (idx >= 0) vocabularyByExactWord.set(existing.word, allVocabularies[idx])
      vocabularyId = existing.id
    }

    const readingAudio = planAnkiReadingAudio(vocabularyId, normalizedPronunciations, wordAudioPath)
    if (readingAudio) pendingReadingAudios.set(JSON.stringify(readingAudio), readingAudio)

    if (targetWordbookId) {
      const rowJlpt = row.tags.map(normalizeVocabularyJlpt).find(Boolean) || wordbookJlpt
      pendingWordbookEntries.set(vocabularyId, rowJlpt)
    }
    const rowTagIds = filterVocabularyTags(row.tags).flatMap(name => {
      const id = tagIdByName.get(name)
      return id ? [id] : []
    })
    for (const tagId of [...globalTagIds, ...rowTagIds]) {
      pendingTagLinks.set(`${vocabularyId}\u0000${tagId}`, { vocabularyId, tagId })
    }

    const importedSense = await ensureAnkiVocabularySenses(
      userId,
      vocabularyId,
      row.meanings,
      row.usage,
      sourceName,
      prisma,
    )
    if (!row.sentence) continue

    const sentenceAudioPath = row.sentenceAudioName
      ? audioMap.get(row.sentenceAudioName) ||
        audioMap.get(normalizeAudioLookupKey(row.sentenceAudioName)) ||
        (row.sentenceAudioName.startsWith('/audios/') ? row.sentenceAudioName : '')
      : ''

    const normalized = normalizeSentenceKey(row.sentence)
    const sentPronData = sentencePronMap.get(row.sentence.trim()) || null
    const existingSentence = await prisma.vocabularySentence.findUnique({ where: { normalizedText_sourceUrl: { normalizedText: normalized, sourceUrl: sentenceSourceUrl } }, select: { audioFile: true, text: true, translation: true, source: true, sourceType: true, sourceId: true } })
    const sentenceRow = await prisma.vocabularySentence.upsert({
      where: {
        normalizedText_sourceUrl: {
          normalizedText: normalized,
          sourceUrl: sentenceSourceUrl,
        },
      },
      update: changedAnkiFields(existingSentence || {}, {
        text: row.sentence,
        translation: row.sentenceTranslation || existingSentence?.translation || null,
        audioFile: preferredAnkiAudio(existingSentence?.audioFile, sentenceAudioPath),
        source: sourceName,
      }),
      create: {
        text: row.sentence,
        normalizedText: normalized,
        translation: row.sentenceTranslation || null,
        audioFile: preferredAnkiAudio(existingSentence?.audioFile, sentenceAudioPath),
        source: sourceName,
        sourceUrl: sentenceSourceUrl,
        sourceType: null,
        sourceId: null,
        pronunciationData: sentPronData
          ? (sentPronData as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        pronunciationVersion: sentPronData ? PRONUNCIATION_VERSION : null,
      },
      select: { id: true },
    })

    await prisma.vocabularySentenceLink.upsert({
      where: {
        vocabularyId_sentenceId: {
          vocabularyId,
          sentenceId: sentenceRow.id,
        },
      },
      update: {},
      create: {
        vocabularyId,
        sentenceId: sentenceRow.id,
        senseId: importedSense.id,
        posTags: toJsonStringList([]),
      },
    })

    linkedSentences += 1
  }

  await Promise.all([
    targetWordbookId && pendingWordbookEntries.size > 0
      ? (async () => {
          const entries = [...pendingWordbookEntries].map(([vocabularyId, jlpt]) => ({
            wordbookId: targetWordbookId,
            vocabularyId,
            jlpt,
          }))
          await prisma.wordbookVocabulary.createMany({ data: entries, skipDuplicates: true })
          await persistImportedWordbookOrder(prisma, userId, targetWordbookId, entries.map(entry => entry.vocabularyId))
          await Promise.all(
            [null, 'N5', 'N4', 'N3', 'N2', 'N1'].map(jlpt =>
              prisma.wordbookVocabulary.updateMany({
                where: {
                  wordbookId: targetWordbookId,
                  vocabularyId: {
                    in: entries
                      .filter(entry => entry.jlpt === jlpt)
                      .map(entry => entry.vocabularyId),
                  },
                },
                data: { jlpt },
              }),
            ),
          )
        })()
      : Promise.resolve(),
    pendingTagLinks.size > 0
      ? prisma.vocabularyTagOnVocabulary.createMany({
          data: [...pendingTagLinks.values()],
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ])

  let addedReadingAudios = 0
  if (pendingReadingAudios.size) {
    const pending = [...pendingReadingAudios.values()]
    const existingReadingAudios = await prisma.vocabularyReadingAudio.findMany({
      where: {
        vocabularyId: { in: [...new Set(pending.map(audio => audio.vocabularyId))] },
      },
      select: { vocabularyId: true, reading: true, audioFile: true, sortOrder: true },
      orderBy: [
        { vocabularyId: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    })
    const existingKeys = new Set(
      existingReadingAudios.map(audio =>
        `${audio.vocabularyId}\u0000${audio.reading}\u0000${audio.audioFile}`,
      ),
    )
    const nextSortOrder = new Map<string, number>()
    existingReadingAudios.forEach(audio => {
      nextSortOrder.set(
        audio.vocabularyId,
        Math.max(nextSortOrder.get(audio.vocabularyId) || 0, audio.sortOrder + 1),
      )
    })
    const data = pending.map(audio => {
      const key = `${audio.vocabularyId}\u0000${audio.reading}\u0000${audio.audioFile}`
      const sortOrder = nextSortOrder.get(audio.vocabularyId) || 0
      if (!existingKeys.has(key)) {
        nextSortOrder.set(audio.vocabularyId, sortOrder + 1)
      }
      return { ...audio, sortOrder }
    })
    const added = await prisma.vocabularyReadingAudio.createMany({
      data,
      skipDuplicates: true,
    })
    addedReadingAudios = added.count
  }

  return {
    success: true as const,
    message: 'Anki 导入完成。',
    summary: {
      totalRows: rows.length,
      created,
      updated,
      linkedSentences,
      uploadedAudios: createdAudioPaths.length,
      reusedAudios: new Set(audioMap.values()).size - createdAudioPaths.length,
      addedReadingAudios,
      sourceName,
      notebookName: selectedWordbook?.title || resolvedNotebookName || '',
      globalTags: globalTags.join(' / '),
    },
  }
    }, { timeout: 120_000, maxWait: 10_000, isolationLevel: 'Serializable' })
    try {
      updateTag(VOCABULARY_GROUPS_CACHE_TAG)
      revalidatePath('/vocabulary', 'layout')
      revalidatePath('/manage/vocabulary')
    } catch (cacheError) { console.error('刷新词汇缓存失败', cacheError) }
    return result
  } catch (error) {
    for (const file of createdAudioPaths) {
      try {
        const url = `/audios/${path.relative(AUDIO_ROOT, file).split(path.sep).join('/')}`
        const [wordRefs, sentenceRefs] = await Promise.all([
          prisma.vocabulary.count({ where: { OR: [{ wordAudio: url }, { readingAudios: { some: { audioFile: url } } }] } }),
          prisma.vocabularySentence.count({ where: { audioFile: url } }),
        ])
        if (wordRefs || sentenceRefs) continue
        await unlink(file)
        let parent = path.dirname(file)
        while (parent !== AUDIO_ROOT) {
          try { await rmdir(parent) } catch { break }
          parent = path.dirname(parent)
        }
      } catch (cleanupError) { console.error('清理本次导入音频失败', cleanupError) }
    }
    console.error('Anki 导入失败，已回滚', error)
    return { success: false as const, message: '导入失败，本次数据库修改已撤销。请重试。' }
  }

}

export async function syncWordbookSources() {
  await requireAdmin()
  const userId = await getCurrentUserId()
  const entries = await prisma.wordbookVocabulary.findMany({
    where: { wordbook: { userId } },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      wordbook: {
        select: { title: true },
      },
    },
  })

  if (entries.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const firstWordbookByVocabularyId = new Map<string, string>()
  for (const entry of entries) {
    if (!firstWordbookByVocabularyId.has(entry.vocabularyId)) {
      firstWordbookByVocabularyId.set(entry.vocabularyId, entry.wordbook.title)
    }
  }

  const links = await prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId: { in: Array.from(firstWordbookByVocabularyId.keys()) } },
    select: {
      sentenceId: true,
      vocabularyId: true,
    },
  })

  const sentenceSourceById = new Map<string, string>()
  for (const link of links) {
    const source = firstWordbookByVocabularyId.get(link.vocabularyId)
    if (!source) continue
    if (!sentenceSourceById.has(link.sentenceId)) {
      sentenceSourceById.set(link.sentenceId, source)
    }
  }

  const sentenceIdsBySource = new Map<string, string[]>()
  sentenceSourceById.forEach((source, sentenceId) => {
    const ids = sentenceIdsBySource.get(source)
    if (ids) ids.push(sentenceId)
    else sentenceIdsBySource.set(source, [sentenceId])
  })
  const updates = await Promise.all(
    [...sentenceIdsBySource].map(([source, sentenceIds]) =>
      prisma.vocabularySentence.updateMany({
        where: {
          id: { in: sentenceIds },
          source: { not: source },
          OR: [
            { sourceId: 'anki-import' },
            { sourceUrl: '/manage/import?language=ja&scope=vocabulary&type=anki' },
          ],
        },
        data: { source },
      }),
    ),
  )
  const updatedCount = updates.reduce((sum, result) => sum + result.count, 0)

  return { success: true, updatedCount }
}
