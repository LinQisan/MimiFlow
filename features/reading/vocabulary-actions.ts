'use server'

import { SourceType } from '@prisma/client'
import { getArticleById } from '@/lib/repositories/materials'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import { buildVocabularyCandidates } from '@/features/reading/domain/sudachi'
import { saveVocabulary } from '@/modules/knowledge/vocabulary/actions'
import { extractSentenceAtOffset } from '@/utils/text/sentenceContext'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

type SavedVocabulary = {
  word: string
  meta: VocabularyMeta
}

export async function saveExtractedArticleVocabulary(
  articleId: string,
  requestedWords: string[],
): Promise<{
  success: boolean
  message: string
  saved: SavedVocabulary[]
}> {
  const normalizedArticleId = articleId.trim()
  const words = Array.from(
    new Set(
      requestedWords
        .slice(0, 60)
        .map(word => word.normalize('NFKC').trim())
        .filter(word => word.length > 0 && word.length <= 80),
    ),
  )
  if (!normalizedArticleId || words.length === 0) {
    return { success: false, message: '请选择词语。', saved: [] }
  }

  const article = await getArticleById(normalizedArticleId)
  if (!article) {
    return { success: false, message: '文章不存在。', saved: [] }
  }
  const texts =
    article.chapters.length > 0
      ? article.chapters.map(chapter => chapter.text)
      : [article.content]
  const analysis = await getSudachiPronunciationMap(texts)
  if (!analysis.available) {
    return { success: false, message: 'SudachiPy 当前不可用。', saved: [] }
  }

  const allowedWords = new Set(
    buildVocabularyCandidates(analysis.tokens, [], 500).map(item => item.word),
  )
  const acceptedWords = words.filter(word => allowedWords.has(word))
  const saved: SavedVocabulary[] = []

  for (let offset = 0; offset < acceptedWords.length; offset += 6) {
    const batch = acceptedWords.slice(offset, offset + 6)
    const results = await Promise.all(
      batch.map(async word => {
        const token = analysis.tokens.find(item => item.dictionaryForm === word)
        if (!token) return null
        const sourceText = texts[token.textIndex] || article.content
        const sentence =
          extractSentenceAtOffset(sourceText, token.begin) || sourceText
        return saveVocabulary(
          word,
          token.surface,
          sentence,
          SourceType.ARTICLE_TEXT,
          article.id,
          token.dictionaryReading || token.reading,
          [token.dictionaryReading || token.reading],
          [],
          token.partsOfSpeech[0] || '',
          token.partsOfSpeech.slice(0, 1),
        )
      }),
    )
    results.forEach(result => {
      if (result?.success && result.word && result.meta) {
        saved.push({ word: result.word, meta: result.meta })
      }
    })
  }

  return {
    success: saved.length > 0,
    message: saved.length > 0 ? `已加入 ${saved.length} 个词。` : '没有新增词语。',
    saved,
  }
}
