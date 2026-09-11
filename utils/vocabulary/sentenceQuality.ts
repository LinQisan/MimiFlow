export type RankedSentenceLike = {
  text: string
  source?: string
  sourceUrl?: string
  sourceType?: string | null
  senseId?: string | null
  posTags?: string[] | null
  audioFile?: string | null
}

export const normalizeVocabularySentenceTextKey = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s([{【（]*\d+[\]).】、．\s-]*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

// Distinct external clips may contain identical dialogue. Keep their identities
// through the existing sentence display pipeline, including the display limit.
const isNadeshikoSentence = (item: RankedSentenceLike) =>
  Boolean(item.sourceUrl?.startsWith('https://nadeshiko.co/sentence/'))

const resolveSourceType = (item: RankedSentenceLike) => {
  if (item.sourceType) return item.sourceType
  const sourceUrl = (item.sourceUrl || '').trim()
  if (sourceUrl.startsWith('/lessons/')) return 'AUDIO_DIALOGUE'
  if (sourceUrl.startsWith('/reading/articles/')) return 'ARTICLE_TEXT'
  if (sourceUrl.startsWith('/quizzes/')) return 'QUIZ_QUESTION'
  const sourceText = (item.source || '').trim()
  if (sourceText.includes('听力')) return 'AUDIO_DIALOGUE'
  if (sourceText.includes('阅读')) return 'ARTICLE_TEXT'
  if (sourceText.includes('题')) return 'QUIZ_QUESTION'
  return 'UNKNOWN'
}

const sourceWeight = (sourceType: string) => {
  if (sourceType === 'AUDIO_DIALOGUE') return 3.2
  if (sourceType === 'ARTICLE_TEXT') return 2.6
  if (sourceType === 'QUIZ_QUESTION') return 2.1
  return 1
}

const sentenceScore = (item: RankedSentenceLike) => {
  const sourceScore = sourceWeight(resolveSourceType(item)) * 1000
  const textLength = Array.from((item.text || '').trim()).length
  const shortSentenceScore = Math.max(0, 260 - Math.min(260, textLength))
  const meaningScore = item.senseId ? 80 : 0
  const posScore = (item.posTags || []).filter(Boolean).length > 0 ? 25 : 0
  return sourceScore + shortSentenceScore + meaningScore + posScore
}

export function dedupeAndRankSentences<T extends RankedSentenceLike>(
  list: T[],
  limit = 12,
): T[] {
  if (!Array.isArray(list) || list.length === 0) return []

  const map = new Map<string, { item: T; score: number }>()
  for (const item of list) {
    const key = isNadeshikoSentence(item)
      ? item.sourceUrl!
      : normalizeVocabularySentenceTextKey(item.text || '')
    if (!key) continue
    const score = sentenceScore(item)
    const existed = map.get(key)
    // Reimports can leave an older, silent copy of the same example. Keep
    // source/meaning ranking, but prefer playable audio when scores tie.
    const addsAudio = Boolean(item.audioFile?.trim()) && !existed?.item.audioFile?.trim()
    if (!existed || score > existed.score || (score === existed.score && addsAudio)) {
      map.set(key, { item, score })
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const lenA = Array.from((a.item.text || '').trim()).length
      const lenB = Array.from((b.item.text || '').trim()).length
      return lenA - lenB
    })
    .filter((entry, index) => index < Math.max(1, limit) || isNadeshikoSentence(entry.item))
    .map(entry => entry.item)
}
