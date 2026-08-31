'use server'

import { SourceType } from '@prisma/client'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { sanitizePronunciations } from '@/utils/text/pronunciation'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabulary/vocabularyCanonical'
import { resolvePathInsideRoot } from '@/utils/files/path'
import { PUBLIC_AUDIO_ROOT } from '@/lib/server/public-paths'

type ParsedRow = {
  rowNo: number
  word: string
  wordAudioRaw: string
  wordAudioName: string
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
const DEFAULT_ANKI_AUDIO_FOLDER = 'vocabulary/anki'
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.webm',
])

const WORD_HEADERS = new Set(['word', '单词', '詞', '単語'])
const PRON_HEADERS = new Set([
  'pronunciation',
  'pronunciations',
  '注音',
  '读音',
  '読み',
  'ふりがな',
])
const WORD_AUDIO_HEADERS = new Set([
  'word_audio',
  'audio_word',
  'word audio',
  '单词音频',
  '单词发音',
  '词音频',
])
const MEANING_HEADERS = new Set(['meaning', 'meanings', '释义', '翻译', '意味'])
const SENTENCE_HEADERS = new Set(['example', 'sentence', '例句', '例文'])
const SENTENCE_TRANSLATION_HEADERS = new Set([
  'sentence_translation',
  'example_translation',
  '例句翻译',
  '例文翻訳',
  'sentence meaning',
])
const SENTENCE_AUDIO_HEADERS = new Set([
  'sentence_audio',
  'example_audio',
  '句子音频',
  '例句音频',
  '音频',
  'audio',
])
const TAG_HEADERS = new Set(['tags', 'tag', '标签', '標籤', 'anki tags'])

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')

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

  let wordIdx = findIndex(WORD_HEADERS)
  let pronIdx = findIndex(PRON_HEADERS)
  let wordAudioIdx = findIndex(WORD_AUDIO_HEADERS)
  let meaningIdx = findIndex(MEANING_HEADERS)
  let sentenceIdx = findIndex(SENTENCE_HEADERS)
  let sentenceTranslationIdx = findIndex(SENTENCE_TRANSLATION_HEADERS)
  let sentenceAudioIdx = findIndex(SENTENCE_AUDIO_HEADERS)
  let tagsIdx = findIndex(TAG_HEADERS)
  let usageIdx = headers.findIndex(h =>
    ['usage', '用法', 'note', 'notes', '备注', 'メモ'].includes(h),
  )

  // Fallback: support header-less Anki export with fixed field order.
  // Expected order (8): word, pronunciation, meaning, sentence, sentence_translation, usage, word_audio, sentence_audio
  const hasNamedHeaders = wordIdx >= 0 || sentenceIdx >= 0
  let startDataIndex = 1
  if (!hasNamedHeaders) {
    const colCount = Math.max(...dataRecords.map(record => record.cells.length))
    wordIdx = 0
    pronIdx = colCount >= 2 ? 1 : -1
    meaningIdx = colCount >= 3 ? 2 : -1
    sentenceIdx = colCount >= 4 ? 3 : -1
    sentenceTranslationIdx = colCount >= 5 ? 4 : -1
    usageIdx = colCount >= 6 ? 5 : -1
    if (colCount >= 8) {
      wordAudioIdx = 6
      sentenceAudioIdx = 7
      tagsIdx = colCount >= 9 ? 8 : -1
    } else if (colCount === 7) {
      wordAudioIdx = 5
      sentenceAudioIdx = 6
      usageIdx = -1
      tagsIdx = -1
    } else if (colCount === 6) {
      wordAudioIdx = -1
      sentenceAudioIdx = 5
      usageIdx = -1
      tagsIdx = -1
    } else {
      wordAudioIdx = -1
      sentenceAudioIdx = -1
      usageIdx = -1
      tagsIdx = -1
    }
    startDataIndex = 0
  }

  const missingHeaders: string[] = []
  if (wordIdx < 0) missingHeaders.push('word/单词')
  if (sentenceIdx < 0) missingHeaders.push('example/sentence/例句')

  const rows: ParsedRow[] = []

  for (let i = startDataIndex; i < dataRecords.length; i += 1) {
    const record = dataRecords[i]
    const cells = record.cells
    const word = stripHtml(cells[wordIdx] || '')
    const sentence = stripHtml(cells[sentenceIdx] || '')
    const pronunciations = pronIdx >= 0 ? splitList(cells[pronIdx] || '') : []
    const wordAudioRaw = wordAudioIdx >= 0 ? (cells[wordAudioIdx] || '').trim() : ''
    const wordAudioName = parseSoundTag(wordAudioRaw) || wordAudioRaw
    const meanings = meaningIdx >= 0 ? splitList(cells[meaningIdx] || '') : []
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

const resolveWordbookPath = async (rawPath: string, userId: string) => {
  const segments = normalizeFolderSegments(rawPath)
  if (segments.length === 0) return null
  if (segments.length !== 2) {
    throw new Error('新建路径必须使用“词书系列/词书”两级格式。')
  }
  const [seriesTitle, wordbookTitle] = segments
  const series = await prisma.wordbookSeries.upsert({
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

const resolveVocabularyTagIds = async (tagNames: string[], userId: string) => {
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
        tags: row.tags,
        status: 'skipped',
        reason: '缺少单词',
      }
    }
    if (!row.sentence) {
      return {
        rowNo: row.rowNo,
        word: row.word,
        wordAudioName: row.wordAudioName,
        sentence: '',
        sentenceTranslation: row.sentenceTranslation,
        sentenceAudioName: row.sentenceAudioName,
        tags: row.tags,
        status: 'skipped',
        reason: '缺少例句',
      }
    }
    return {
      rowNo: row.rowNo,
      word: row.word,
      wordAudioName: row.wordAudioName,
      sentence: row.sentence,
      sentenceTranslation: row.sentenceTranslation,
      sentenceAudioName: row.sentenceAudioName,
      tags: row.tags,
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

async function uploadAudioFiles(files: File[], folderInput: string) {
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

  const resolvedFolder = folder || DEFAULT_ANKI_AUDIO_FOLDER
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
    let suffix = 2
    while (await audioFileExists(path.join(targetDir, finalName))) {
      finalName = `${safe}-${suffix}${ext}`
      suffix += 1
    }
    const abs = path.join(targetDir, finalName)
    await writeFile(abs, Buffer.from(await file.arrayBuffer()))

    const webPath = `/audios/${resolvedFolder}/${finalName}`.replace(/\/+/g, '/')
    const originalBase = path.basename(file.name)
    map.set(originalBase, webPath)
    map.set(normalizeAudioLookupKey(originalBase), webPath)
  }

  return map
}

export async function previewAnkiImport(formData: FormData) {
  const userId = await getCurrentUserId()
  const tsv = formData.get('tsvFile') as File | null
  if (!tsv || tsv.size === 0) {
    return { success: false, message: '请先选择 Anki TSV 文件。' }
  }

  const text = await tsv.text()
  const { rows, missingHeaders } = parseTsv(text)

  if (missingHeaders.length > 0) {
    return {
      success: false,
      message: `缺少必要字段：${missingHeaders.join('、')}`,
    }
  }

  const truncatedRows = rows.slice(0, MAX_IMPORT_ROWS)
  const validRows = truncatedRows.filter(item => item.word && item.sentence)

  const uniqueWords = Array.from(new Set(validRows.map(item => item.word)))
  const notebookName = String(formData.get('notebookName') || '').trim()
  const wordbookId = String(formData.get('wordbookId') || '').trim()
  const [existingWords, selectedWordbook] = await Promise.all([
    prisma.vocabulary.findMany({
      where: { userId, word: { in: uniqueWords } },
      select: { word: true },
    }),
    wordbookId
      ? prisma.wordbook.findFirst({
          where: { id: wordbookId, userId },
          select: { title: true },
        })
      : Promise.resolve(null),
  ])
  if (wordbookId && !selectedWordbook) {
    return { success: false, message: '目标单词书不存在或已不可用，请重新选择。' }
  }
  const existingWordSet = new Set(existingWords.map(item => item.word))

  const audioFiles = (formData.getAll('audioFiles') as File[]).filter(file => file?.size > 0)
  if (!wordbookId && notebookName && normalizeFolderSegments(notebookName).length !== 2) {
    return {
      success: false,
      message: '新建路径必须使用“词书系列/词书”两级格式。',
    }
  }
  const wordbookTitle = selectedWordbook?.title || ''
  const sourceName = wordbookTitle || notebookName || 'Anki导入'
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
      globalTags: globalTags.join(' / '),
      sampleRows: createPreviewRows(truncatedRows),
      rowsJson: JSON.stringify(validRows),
    },
  }
}

export async function runAnkiImport(formData: FormData) {
  const userId = await getCurrentUserId()
  const rowsJson = String(formData.get('rowsJson') || '')
  const audioFolder =
    String(formData.get('audioFolder') || DEFAULT_ANKI_AUDIO_FOLDER).trim() ||
    DEFAULT_ANKI_AUDIO_FOLDER
  const notebookName = String(formData.get('notebookName') || '').trim()
  const selectedWordbookId = String(formData.get('wordbookId') || '').trim()
  const globalTags = splitList(String(formData.get('globalTags') || ''))
  const rows = parseRowsJson(rowsJson)
  if (rows.length === 0) {
    return { success: false, message: '没有可导入的数据。请先预览。' }
  }

  const audioFiles = (formData.getAll('audioFiles') as File[]).filter(file => file?.size > 0)
  const selectedWordbook = selectedWordbookId
    ? await prisma.wordbook.findFirst({
        where: { id: selectedWordbookId, userId },
        select: { id: true, title: true },
      })
    : null
  if (selectedWordbookId && !selectedWordbook) {
    return { success: false, message: '目标单词书不存在或已不可用，请重新选择。' }
  }
  const sourceName = selectedWordbook?.title || notebookName || 'Anki导入'
  let targetWordbookId: string | null = selectedWordbook?.id || null
  if (!selectedWordbookId && notebookName) {
    try {
      targetWordbookId = await resolveWordbookPath(notebookName, userId)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '词书路径无效。',
      }
    }
  }
  const audioMap = await uploadAudioFiles(audioFiles, audioFolder)
  const tagIdByName = await resolveVocabularyTagIds(
    [...globalTags, ...rows.flatMap(row => row.tags)],
    userId,
  )
  const globalTagIds = globalTags.flatMap(name => {
    const id = tagIdByName.get(name)
    return id ? [id] : []
  })

  let created = 0
  let updated = 0
  let linkedSentences = 0
  const allVocabularies = await prisma.vocabulary.findMany({
    where: { userId },
    select: { id: true, word: true, pronunciations: true, meanings: true, wordAudio: true },
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
  const pendingWordbookVocabularyIds = new Set<string>()
  const pendingTagLinks = new Map<string, { vocabularyId: string; tagId: string }>()

  for (const row of rows) {
    if (!row.word || !row.sentence) continue

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
    const normalizedPronunciations = sanitizePronunciations(
      row.word,
      row.pronunciations,
    )

    const wordAudioPath = row.wordAudioName
      ? audioMap.get(row.wordAudioName) ||
        audioMap.get(normalizeAudioLookupKey(row.wordAudioName)) ||
        (row.wordAudioName.startsWith('/audios/') ? row.wordAudioName : '')
      : ''

    let vocabularyId = ''
    if (!existing) {
      const createdVocab = await prisma.vocabulary.create({
        data: {
          userId,
          word: row.word,
          sourceType: SourceType.ARTICLE_TEXT,
          sourceId: 'anki-import',
          wordAudio: wordAudioPath || null,
          pronunciations: toJsonStringList(normalizedPronunciations),
          partsOfSpeech: toJsonStringList([]),
          meanings: toJsonStringList(row.meanings),
        },
        select: { id: true },
      })
      allVocabularies.push({
        id: createdVocab.id,
        word: row.word,
        pronunciations: toJsonStringList(normalizedPronunciations),
        meanings: toJsonStringList(row.meanings),
        wordAudio: wordAudioPath || null,
      })
      indexVocabulary(
        allVocabularies[allVocabularies.length - 1],
        allVocabularies.length - 1,
      )
      vocabularyId = createdVocab.id
      created += 1
    } else {
      const mergedPron = toJsonStringList([
        ...sanitizePronunciations(
          row.word,
          parseJsonStringList(existing.pronunciations),
        ),
        ...normalizedPronunciations,
      ])
      const mergedMeaning = toJsonStringList([
        ...parseJsonStringList(existing.meanings),
        ...row.meanings,
      ])

      await prisma.vocabulary.update({
        where: { id: existing.id },
        data: {
          wordAudio: wordAudioPath || existing.wordAudio || null,
          pronunciations: mergedPron,
          meanings: mergedMeaning,
        },
      })
      const idx = allVocabularies.findIndex(item => item.id === existing!.id)
      if (idx >= 0) {
        allVocabularies[idx] = {
          ...allVocabularies[idx],
          pronunciations: mergedPron,
          meanings: mergedMeaning,
          wordAudio: wordAudioPath || allVocabularies[idx].wordAudio || null,
        }
      }
      vocabularyId = existing.id
      updated += 1
    }

    if (targetWordbookId) pendingWordbookVocabularyIds.add(vocabularyId)
    const rowTagIds = row.tags.flatMap(name => {
      const id = tagIdByName.get(name)
      return id ? [id] : []
    })
    for (const tagId of [...globalTagIds, ...rowTagIds]) {
      pendingTagLinks.set(`${vocabularyId}\u0000${tagId}`, { vocabularyId, tagId })
    }

    const sentenceAudioPath = row.sentenceAudioName
      ? audioMap.get(row.sentenceAudioName) ||
        audioMap.get(normalizeAudioLookupKey(row.sentenceAudioName)) ||
        (row.sentenceAudioName.startsWith('/audios/') ? row.sentenceAudioName : '')
      : ''

    const normalized = normalizeSentenceKey(row.sentence)
    const sentenceRow = await prisma.vocabularySentence.upsert({
      where: {
        normalizedText_sourceUrl: {
          normalizedText: normalized,
          sourceUrl: '/manage/import?type=anki',
        },
      },
      update: {
        text: row.sentence,
        translation: row.sentenceTranslation || null,
        audioFile: sentenceAudioPath || null,
        source: sourceName,
        sourceType: SourceType.ARTICLE_TEXT,
        sourceId: 'anki-import',
      },
      create: {
        text: row.sentence,
        normalizedText: normalized,
        translation: row.sentenceTranslation || null,
        audioFile: sentenceAudioPath || null,
        source: sourceName,
        sourceUrl: '/manage/import?type=anki',
        sourceType: SourceType.ARTICLE_TEXT,
        sourceId: 'anki-import',
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
        meaningIndex: null,
        posTags: toJsonStringList([]),
      },
    })

    linkedSentences += 1
  }

  await Promise.all([
    targetWordbookId && pendingWordbookVocabularyIds.size > 0
      ? prisma.wordbookVocabulary.createMany({
          data: [...pendingWordbookVocabularyIds].map(vocabularyId => ({
            wordbookId: targetWordbookId,
            vocabularyId,
          })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    pendingTagLinks.size > 0
      ? prisma.vocabularyTagOnVocabulary.createMany({
          data: [...pendingTagLinks.values()],
          skipDuplicates: true,
        })
      : Promise.resolve(),
  ])

  return {
    success: true,
    message: 'Anki 导入完成。',
    summary: {
      totalRows: rows.length,
      created,
      updated,
      linkedSentences,
      uploadedAudios: new Set(audioMap.values()).size,
      sourceName,
      notebookName: selectedWordbook?.title || notebookName || '',
      globalTags: globalTags.join(' / '),
    },
  }
}

export async function syncWordbookSources() {
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
            { sourceUrl: '/manage/import?type=anki' },
          ],
        },
        data: { source },
      }),
    ),
  )
  const updatedCount = updates.reduce((sum, result) => sum + result.count, 0)

  return { success: true, updatedCount }
}
