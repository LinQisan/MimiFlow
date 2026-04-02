'use server'

import { SourceType } from '@prisma/client'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import prisma from '@/lib/prisma'
import { parseJsonStringList, toJsonStringList } from '@/utils/jsonList'
import { sanitizePronunciations } from '@/utils/pronunciation'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabularyCanonical'

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
}

type PreviewRow = {
  rowNo: number
  word: string
  wordAudioName: string
  sentence: string
  sentenceTranslation: string
  sentenceAudioName: string
  status: 'valid' | 'skipped'
  reason?: string
}

const MAX_PREVIEW_ROWS = 24
const MAX_IMPORT_ROWS = 5000
const AUDIO_ROOT = path.join(process.cwd(), 'public', 'audios')

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
    } else if (colCount === 7) {
      wordAudioIdx = 5
      sentenceAudioIdx = 6
      usageIdx = -1
    } else if (colCount === 6) {
      wordAudioIdx = -1
      sentenceAudioIdx = 5
      usageIdx = -1
    } else {
      wordAudioIdx = -1
      sentenceAudioIdx = -1
      usageIdx = -1
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
    .replace(/[\s]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')

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
      }))
      .filter(item => item.rowNo > 0)
  } catch {
    return []
  }
}

async function uploadAudioFiles(files: File[], folderInput: string) {
  const folder = folderInput
    .replace(/\\/g, '/')
    .split('/')
    .map(x => x.trim())
    .filter(Boolean)
    .join('/')

  const resolvedFolder = folder || 'imports/anki'
  const targetDir = path.join(AUDIO_ROOT, resolvedFolder)
  await mkdir(targetDir, { recursive: true })

  const map = new Map<string, string>()

  for (const file of files) {
    if (!file || file.size === 0) continue
    const ext = path.extname(file.name).toLowerCase()
    if (!ext) continue

    const safe = safeFileName(path.basename(file.name, ext)) || 'audio'
    const finalName = `${Date.now()}-${safe}${ext}`
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
  const existingWords = await prisma.vocabulary.findMany({
    where: { word: { in: uniqueWords } },
    select: { word: true },
  })
  const existingWordSet = new Set(existingWords.map(item => item.word))

  const audioFiles = (formData.getAll('audioFiles') as File[]).filter(file => file?.size > 0)
  const notebookName = String(formData.get('notebookName') || '').trim()
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
      sampleRows: createPreviewRows(truncatedRows),
      rowsJson: JSON.stringify(validRows),
    },
  }
}

export async function runAnkiImport(formData: FormData) {
  const rowsJson = String(formData.get('rowsJson') || '')
  const audioFolder = String(formData.get('audioFolder') || 'imports/anki').trim() || 'imports/anki'
  const sourceLabel = String(formData.get('sourceLabel') || '').trim()
  const notebookName = String(formData.get('notebookName') || '').trim()
  const rows = parseRowsJson(rowsJson)
  if (rows.length === 0) {
    return { success: false, message: '没有可导入的数据。请先预览。' }
  }

  const audioFiles = (formData.getAll('audioFiles') as File[]).filter(file => file?.size > 0)
  const audioMap = await uploadAudioFiles(audioFiles, audioFolder)
  const sourceName = sourceLabel || 'Anki导入'
  let targetFolderId: string | null = null
  if (notebookName) {
    const existed = await prisma.vocabularyFolder.findUnique({
      where: { name: notebookName },
      select: { id: true },
    })
    if (existed) {
      targetFolderId = existed.id
    } else {
      const createdFolder = await prisma.vocabularyFolder.create({
        data: { name: notebookName },
        select: { id: true },
      })
      targetFolderId = createdFolder.id
    }
  }

  let created = 0
  let updated = 0
  let linkedSentences = 0
  const allVocabularies = await prisma.vocabulary.findMany({
    select: { id: true, word: true, pronunciations: true, meanings: true, folderId: true, wordAudio: true },
  })

  for (const row of rows) {
    if (!row.word || !row.sentence) continue

    let existing = allVocabularies.find(item => item.word === row.word) || null
    if (!existing) {
      const targetKeys = new Set(buildVocabularyCanonicalKeys(row.word))
      if (targetKeys.size > 0) {
        let best: (typeof allVocabularies)[number] | null = null
        let bestScore = -1
        for (const candidate of allVocabularies) {
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
          word: row.word,
          sourceType: SourceType.ARTICLE_TEXT,
          sourceId: 'anki-import',
          groupName: null,
          folderId: targetFolderId,
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
        folderId: targetFolderId,
        wordAudio: wordAudioPath || null,
      })
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
          folderId: targetFolderId || existing.folderId || null,
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
          folderId: targetFolderId || allVocabularies[idx].folderId || null,
        }
      }
      vocabularyId = existing.id
      updated += 1
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
          sourceUrl: '/manage/import/anki',
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
        sourceUrl: '/manage/import/anki',
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

  return {
    success: true,
    message: 'Anki 导入完成。',
    summary: {
      totalRows: rows.length,
      created,
      updated,
      linkedSentences,
      uploadedAudios: audioMap.size,
      sourceName,
      notebookName: notebookName || '',
    },
  }
}
