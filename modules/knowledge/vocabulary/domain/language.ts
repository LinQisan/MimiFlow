import { guessLanguageCode } from '@/utils/language/langDetector'

const LANGUAGE_GROUP_NAMES: Record<string, string> = {
  ja: '日语',
  en: '英语',
  ko: '韩语',
  zh: '中文',
  other: '未分类',
}

const JAPANESE_SOURCE_TYPES = new Set([
  'AUDIO_DIALOGUE',
  'MEDIA_SUBTITLE_LINE',
  'ARTICLE_TEXT',
  'QUIZ_QUESTION',
])

const containsKana = (text: string) => /[\u3040-\u30ff]/.test(text)

export function resolveVocabularyLanguageCode({
  word,
  pronunciations = [],
  sourceType,
}: {
  word: string
  pronunciations?: string[]
  sourceType?: string | null
}) {
  const guessed = guessLanguageCode(word) || 'other'
  if (guessed !== 'zh') return guessed

  // 纯汉字无法仅凭字形区分中日文。词汇中心的日语来源和假名读音
  // 比 Unicode 字符范围更可靠，例如「石油 / せきゆ」。
  if (pronunciations.some(containsKana)) return 'ja'
  if (sourceType && JAPANESE_SOURCE_TYPES.has(sourceType)) return 'ja'
  return 'zh'
}

export function resolveVocabularyGroupName(input: {
  word: string
  pronunciations?: string[]
  sourceType?: string | null
}) {
  const languageCode = resolveVocabularyLanguageCode(input)
  return LANGUAGE_GROUP_NAMES[languageCode] || '未分类'
}
