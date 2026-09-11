import 'server-only'

import prisma from '@/lib/prisma'
import { mapSentencePronunciationResults } from '../domain/pronunciation-batch'
import { getSudachiPronunciationMap } from '@/modules/language/server/sudachi-pronunciation'
import { formatJapaneseTextWithSudachiTokens } from '@/modules/language/domain/sudachi-ruby'
import { formatJapaneseTextWithSudachiRubyNotation } from '@/utils/language/japaneseRuby'
import { hasJapanese } from '@/modules/language/domain/text'
import {
  PRONUNCIATION_VERSION,
  isPronunciationUpToDate,
  parseRubyNotationToSegments,
  type VocabularyPronunciationData,
} from '../domain/pronunciation'

/**
 * Compute pronunciation segments for a batch of Japanese words in ONE IPC call to persistent worker.
 */
export async function batchComputeVocabularyPronunciations(
  words: string[],
): Promise<Map<string, VocabularyPronunciationData>> {
  const cleanWords = Array.from(
    new Set(words.map(w => w.trim()).filter(Boolean)),
  )
  const results = new Map<string, VocabularyPronunciationData>()
  const japaneseWords = cleanWords.filter(w => hasJapanese(w))

  if (japaneseWords.length === 0) {
    cleanWords.forEach(w => results.set(w, { segments: [{ text: w }] }))
    return results
  }

  const CHUNK_SIZE = 300
  for (let i = 0; i < japaneseWords.length; i += CHUNK_SIZE) {
    const chunk = japaneseWords.slice(i, i + CHUNK_SIZE)
    const analysis = await getSudachiPronunciationMap(chunk)
    for (const word of chunk) {
      const notation = formatJapaneseTextWithSudachiRubyNotation(
        word,
        analysis.lexicon,
      )
      const segments = parseRubyNotationToSegments(notation)
      const reading = analysis.pronunciationMap[word] || undefined
      results.set(word, {
        segments: segments.length > 0 ? segments : [{ text: word }],
        ...(reading ? { reading } : {}),
      })
    }
  }

  for (const word of cleanWords) {
    if (!results.has(word)) {
      results.set(word, { segments: [{ text: word }] })
    }
  }

  return results
}

/**
 * Compute pronunciation segments for a batch of Japanese sentence texts in chunks of 300 items per IPC call.
 */
export async function batchComputeSentencePronunciations(
  sentences: string[],
): Promise<Map<string, VocabularyPronunciationData>> {
  const cleanSentences = Array.from(
    new Set(sentences.map(s => s.trim()).filter(Boolean)),
  )
  const results = new Map<string, VocabularyPronunciationData>()
  const japaneseSentences = cleanSentences.filter(s => hasJapanese(s))

  if (japaneseSentences.length === 0) {
    cleanSentences.forEach(s => results.set(s, { segments: [{ text: s }] }))
    return results
  }

  const CHUNK_SIZE = 300
  for (let i = 0; i < japaneseSentences.length; i += CHUNK_SIZE) {
    const chunk = japaneseSentences.slice(i, i + CHUNK_SIZE)
    const analysis = await getSudachiPronunciationMap(chunk)
    for (const [textIndex, text] of chunk.entries()) {
      const notation = formatJapaneseTextWithSudachiTokens(
        text,
        analysis.tokens,
        textIndex,
        analysis.lexicon,
      )
      const segments = parseRubyNotationToSegments(notation)
      results.set(text, {
        segments: segments.length > 0 ? segments : [{ text }],
      })
    }
  }

  for (const text of cleanSentences) {
    if (!results.has(text)) {
      results.set(text, { segments: [{ text }] })
    }
  }

  return results
}

/**
 * Single-item write helper with best-effort error handling.
 */
export async function computeSingleVocabularyPronunciation(
  word: string,
  preferredReading?: string | null,
): Promise<VocabularyPronunciationData | null> {
  const clean = word.trim()
  if (!clean || !hasJapanese(clean)) return null
  try {
    const map = await batchComputeVocabularyPronunciations([clean])
    const data = map.get(clean) || null
    if (data && preferredReading?.trim()) {
      return {
        ...data,
        reading: preferredReading.trim(),
      }
    }
    return data
  } catch (error) {
    console.error('Failed to compute single vocabulary pronunciation:', error)
    return null
  }
}

/**
 * Single-sentence write helper with best-effort error handling.
 */
export async function computeSingleSentencePronunciation(
  text: string,
): Promise<VocabularyPronunciationData | null> {
  const clean = text.trim()
  if (!clean || !hasJapanese(clean)) return null
  try {
    const map = await batchComputeSentencePronunciations([clean])
    return map.get(clean) || null
  } catch (error) {
    console.error('Failed to compute single sentence pronunciation:', error)
    return null
  }
}

/**
 * Materialize cache misses for vocabulary items by their IDs.
 * Server queries the latest DB values, runs Sudachi in 1 batch, persists to DB, and returns results.
 */
export async function materializeVocabularyBatch(
  vocabularyIds: string[],
  userId: string,
): Promise<Record<string, VocabularyPronunciationData>> {
  if (vocabularyIds.length === 0) return {}

  const rows = await prisma.vocabulary.findMany({
    where: {
      id: { in: vocabularyIds },
      userId,
    },
    select: {
      id: true,
      word: true,
      pronunciationData: true,
      pronunciationVersion: true,
    },
  })

  const toCompute = rows.filter(
    row => !isPronunciationUpToDate(row) && hasJapanese(row.word),
  )
  const result: Record<string, VocabularyPronunciationData> = {}

  // Existing up-to-date items
  rows.forEach(row => {
    if (isPronunciationUpToDate(row) && row.pronunciationData) {
      result[row.id] = row.pronunciationData as VocabularyPronunciationData
    }
  })

  if (toCompute.length === 0) {
    return result
  }

  const computedMap = await batchComputeVocabularyPronunciations(
    toCompute.map(r => r.word),
  )

  await prisma.$transaction(
    toCompute.map(row => {
      const data = computedMap.get(row.word) || {
        segments: [{ text: row.word }],
      }
      result[row.id] = data
      return prisma.vocabulary.update({
        where: { id: row.id },
        data: {
          pronunciationData: data as unknown as object,
          pronunciationVersion: PRONUNCIATION_VERSION,
        },
      })
    }),
  )

  return result
}

/**
 * Materialize cache misses for sentence items by their IDs.
 */
export async function materializeSentenceBatch(
  sentenceIds: string[],
  userId: string,
): Promise<Record<string, VocabularyPronunciationData>> {
  if (sentenceIds.length === 0) return {}

  // Cards retain link IDs for editing; accept both link IDs and sentence IDs.
  const links = await prisma.vocabularySentenceLink.findMany({
    where: {
      vocabulary: { userId },
      OR: [{ id: { in: sentenceIds } }, { sentenceId: { in: sentenceIds } }],
    },
    select: { id: true, sentenceId: true },
  })
  const resolvedIds = [...new Set(links.map(link => link.sentenceId))]
  const mapResult = (data: Record<string, VocabularyPronunciationData>) =>
    mapSentencePronunciationResults(sentenceIds, links, data)

  const rows = await prisma.vocabularySentence.findMany({
    where: { id: { in: resolvedIds } },
    select: {
      id: true,
      text: true,
      pronunciationData: true,
      pronunciationVersion: true,
    },
  })

  const toCompute = rows.filter(
    row => !isPronunciationUpToDate(row) && hasJapanese(row.text),
  )
  const result: Record<string, VocabularyPronunciationData> = {}

  rows.forEach(row => {
    if (isPronunciationUpToDate(row) && row.pronunciationData) {
      result[row.id] = row.pronunciationData as VocabularyPronunciationData
    }
  })

  if (toCompute.length === 0) {
    return mapResult(result)
  }

  const computedMap = await batchComputeSentencePronunciations(
    toCompute.map(r => r.text),
  )

  await prisma.$transaction(
    toCompute.map(row => {
      const data = computedMap.get(row.text) || {
        segments: [{ text: row.text }],
      }
      result[row.id] = data
      return prisma.vocabularySentence.update({
        where: { id: row.id },
        data: {
          pronunciationData: data as unknown as object,
          pronunciationVersion: PRONUNCIATION_VERSION,
        },
      })
    }),
  )

  return mapResult(result)
}
