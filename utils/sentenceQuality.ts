export type RankedSentenceLike = {
  text: string
  source?: string
  sourceUrl?: string
  sourceType?: string | null
  meaningIndex?: number | null
  posTags?: string[] | null
}

const normalizeTextKey = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s([{【（]*\d+[\]).】、．\s-]*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const resolveSourceType = (item: RankedSentenceLike) => {
  if (item.sourceType) return item.sourceType
  const sourceUrl = (item.sourceUrl || '').trim()
  if (sourceUrl.startsWith('/lessons/')) return 'AUDIO_DIALOGUE'
  if (sourceUrl.startsWith('/articles/')) return 'ARTICLE_TEXT'
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
  const meaningScore = typeof item.meaningIndex === 'number' ? 80 : 0
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
    const key = normalizeTextKey(item.text || '')
    if (!key) continue
    const score = sentenceScore(item)
    const existed = map.get(key)
    if (!existed || score > existed.score) {
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
    .slice(0, Math.max(1, limit))
    .map(entry => entry.item)
}

