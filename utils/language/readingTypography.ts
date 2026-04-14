import { guessLanguageCode } from './langDetector'

const detectReadingLanguage = (text: string) => {
  const sample = text.trim()
  if (!sample) return 'other'
  const lang = guessLanguageCode(sample)
  if (/[\u3040-\u30ff]/.test(sample) || lang === 'ja') return 'ja'
  if (lang === 'zh') return 'zh'
  if (lang === 'en' || /[A-Za-z]/.test(sample)) return 'en'
  return 'other'
}

export const getReadingFontClass = (text: string) => {
  const lang = detectReadingLanguage(text)
  if (lang === 'ja') return 'font-reading-ja'
  if (lang === 'zh') return 'font-reading-zh'
  if (lang === 'en') return 'font-reading-en'
  return ''
}

export const getReadingBodyFontClass = (text: string) => {
  const lang = detectReadingLanguage(text)
  if (lang === 'ja') return 'font-reading-body-ja'
  if (lang === 'zh') return 'font-reading-body-zh'
  if (lang === 'en') return 'font-reading-body-en'
  return ''
}
