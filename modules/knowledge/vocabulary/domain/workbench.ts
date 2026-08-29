import { Rating } from 'ts-fsrs'

import { normalizeVocabularyHeadword } from '@/utils/vocabulary/vocabularyCanonical'
import { formatVocabularySentenceSource } from '@/utils/vocabulary/sourceDisplay'
import type {
  InflectionFamily,
  InflectionVariant,
  VocabItem,
} from '../types'

export {
  buildFolderTree,
  flattenFolderTree,
} from './wordbook-tree.ts'

export const LANGUAGE_NAMES: Record<string, string> = {
  ja: '日语',
  en: '英语',
  ko: '韩语',
  zh: '中文',
  other: '更多',
}

export const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const firstSentencePosTag = (tags?: string[]) => {
  if (!Array.isArray(tags)) return ''
  return tags.map(item => item.trim()).find(Boolean) || ''
}

export const getPrimaryPronunciation = (vocab: VocabItem) =>
  (vocab.pronunciations || []).map(item => item.trim()).find(Boolean) ||
  (vocab.pronunciation || '').trim()

export const normalizeLanguageCode = (value: string) => {
  const text = value.trim().toLowerCase()
  if (text === 'ja' || text.includes('日语') || text.includes('日本')) return 'ja'
  if (text === 'en' || text.includes('英语') || text.includes('english')) return 'en'
  if (text === 'ko' || text.includes('韩语') || text.includes('korean')) return 'ko'
  if (text === 'zh' || text.includes('中文') || text.includes('chinese')) return 'zh'
  return 'other'
}

export const supportsPronunciationByLanguage = (languageCode?: string) =>
  languageCode === 'ja' || languageCode === 'en'

export const getSentenceSourceDisplay = formatVocabularySentenceSource

const dateToMs = (value?: Date | string | null) => {
  if (!value) return Number.NaN
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

const seededShuffle = <T>(list: T[], seed: number) => {
  const result = [...list]
  let state = Math.max(1, seed % 2147483647)
  const next = () => {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export const resolveInconsistentMemoryRating = (
  first: Rating,
  second: Rating,
) => {
  if (first === second) return first
  if (second < first) return second
  if (first === Rating.Again) return Rating.Hard
  if (first === Rating.Hard) return Rating.Good
  return Rating.Easy
}

export const buildInflectionFamilyMap = (
  groupedVocabulary: Record<string, VocabItem[]>,
) => {
  const familyBuckets = new Map<string, VocabItem[]>()
  Object.values(groupedVocabulary)
    .flat()
    .forEach(item => {
      const tags = item.partsOfSpeech || []
      const hasTargetPos = tags.some(
        tag =>
          tag.includes('動詞') ||
          tag.includes('形容詞') ||
          tag.includes('形容動詞'),
      )
      if (
        !hasTargetPos ||
        !/[\u3040-\u30ff\u4e00-\u9fff]/.test(item.word)
      )
        return
      const lemma = normalizeVocabularyHeadword(item.word, tags)
      if (!lemma) return
      familyBuckets.set(lemma, [...(familyBuckets.get(lemma) || []), item])
    })

  const result = new Map<string, InflectionFamily>()
  familyBuckets.forEach((items, lemma) => {
    const uniqueWords = Array.from(
      new Set(items.map(item => item.word.trim()).filter(Boolean)),
    )
    if (uniqueWords.length <= 1) return
    const allSentences = items.flatMap(item => item.sentences || [])
    const variants: InflectionVariant[] = uniqueWords
      .map(word => ({
        word,
        sentenceHits: allSentences.filter(sentence =>
          new RegExp(escapeRegExp(word)).test(sentence.text),
        ).length,
        sentenceTotal: allSentences.length,
      }))
      .sort(
        (left, right) =>
          right.sentenceHits - left.sentenceHits ||
          left.word.localeCompare(right.word, 'ja'),
      )
    const coveredVariants = variants.filter(item => item.sentenceHits > 0).length
    const family = {
      lemma,
      totalVariants: variants.length,
      coveredVariants,
      coverage:
        variants.length > 0
          ? Math.round((coveredVariants / variants.length) * 100)
          : 0,
      variants,
    }
    items.forEach(item => result.set(item.id, family))
  })
  return result
}

export const getVocabularyPosOptions = (items: VocabItem[]) =>
  Array.from(
    new Set(
      items.flatMap(item =>
        (item.partsOfSpeech || []).map(pos => pos.trim()).filter(Boolean),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))

export const filterAndSortVocabulary = (
  items: VocabItem[],
  selectedPos: string,
  selectedFolder: string,
  sortMode: 'recent' | 'word' | 'pos',
) =>
  items
    .filter(item => {
      const matchesPos =
        selectedPos === 'all' ||
        (item.partsOfSpeech || []).some(pos => pos === selectedPos)
      const matchesFolder =
        selectedFolder === 'all' ||
        (selectedFolder === 'none'
          ? !item.folderId
          : item.folderId === selectedFolder)
      return matchesPos && matchesFolder
    })
    .sort((left, right) => {
      if (sortMode === 'word') return left.word.localeCompare(right.word, 'ja')
      if (sortMode === 'pos') {
        const leftPos = (left.partsOfSpeech || [])[0] || ''
        const rightPos = (right.partsOfSpeech || [])[0] || ''
        return leftPos === rightPos
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : leftPos.localeCompare(rightPos, 'zh-Hans-CN')
      }
      return right.createdAt.getTime() - left.createdAt.getTime()
    })

export const buildFlashVocabularyList = (
  items: VocabItem[],
  memoryMode: boolean,
  nowMs: number,
  randomOrder: boolean,
  shuffleSeed: number,
) => {
  let result = [...items]
  if (memoryMode) {
    const due: VocabItem[] = []
    const fresh: VocabItem[] = []
    const upcoming: VocabItem[] = []
    result.forEach(item => {
      const dueMs = dateToMs(item.review?.due || null)
      if (Number.isNaN(dueMs)) fresh.push(item)
      else if (dueMs <= nowMs) due.push(item)
      else upcoming.push(item)
    })
    const byDue = (left: VocabItem, right: VocabItem) =>
      dateToMs(left.review?.due || null) - dateToMs(right.review?.due || null)
    due.sort(byDue)
    upcoming.sort(byDue)
    result = [...due, ...fresh, ...upcoming]
  }
  return randomOrder && result.length > 1
    ? seededShuffle(result, shuffleSeed)
    : result
}
