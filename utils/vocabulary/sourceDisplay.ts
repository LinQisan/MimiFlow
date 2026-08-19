type SentenceSourceLike = {
  source?: string | null
  sourceUrl?: string | null
  sourceType?: string | null
}

const stripLeadingIcons = (text: string) =>
  text.replace(/^[^\p{L}\p{N}\u4e00-\u9fa5ぁ-んァ-ヶ]+/u, '').trim()

const getSourceTypeLabel = (sentence: SentenceSourceLike) => {
  const sourceText = stripLeadingIcons(sentence.source || '')
  const sourceUrl = sentence.sourceUrl || ''
  if (sentence.sourceType === 'QUIZ_QUESTION') return '题目'
  if (sentence.sourceType === 'ARTICLE_TEXT') return '阅读'
  if (sentence.sourceType === 'MEDIA_SUBTITLE_LINE') return '影视'
  if (sourceText.includes('跟读')) return '跟读'
  if (sourceText.includes('题目') || sourceUrl.startsWith('/practice/'))
    return '题目'
  if (sourceUrl.startsWith('/reading/articles/')) return '阅读'
  if (sourceUrl.startsWith('/listening/')) return '听力'
  if (sourceText.includes('阅读')) return '阅读'
  if (sourceText.includes('听力')) return '听力'
  if (sourceText.includes('影视')) return '影视'
  if (sourceText.includes('题')) return '题目'
  return ''
}

export const formatVocabularySentenceSource = (
  sentence: SentenceSourceLike,
) => {
  const sourceType = getSourceTypeLabel(sentence)
  const sourceText = stripLeadingIcons(sentence.source || '')
  if (!sourceType) {
    return sourceText && sourceText !== '未知来源' ? sourceText : ''
  }
  const [, ...rest] = sourceText.split(/[：:]/)
  const detail = rest.join('：').trim()
  const normalizedDetail = !detail || detail === '未知来源' ? '' : detail
  if (!normalizedDetail || normalizedDetail === sourceType) return sourceType
  return `${sourceType} · ${normalizedDetail}`
}
