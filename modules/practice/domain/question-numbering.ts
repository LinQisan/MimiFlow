export type NumberedPracticeQuestion = {
  id: string
  isListening: boolean
  sectionKey: string
}

const normalizedLanguage = (language?: string | null) =>
  (language || '').trim().toLowerCase()

const isJapaneseLanguage = (language?: string | null) => {
  const value = normalizedLanguage(language)
  return (
    value === 'ja' ||
    value.startsWith('ja-') ||
    value.includes('japanese') ||
    /日语|日文|日本语|日本語/.test(language || '')
  )
}

const isEnglishLanguage = (language?: string | null) => {
  const value = normalizedLanguage(language)
  return value === 'en' || value.startsWith('en-') || value.includes('english')
}

export function buildPracticeQuestionNumberMap(
  questions: NumberedPracticeQuestion[],
  language?: string | null,
) {
  const numbers = new Map<string, number>()
  const counters = new Map<string, number>()
  const isJapanese = isJapaneseLanguage(language)
  const isEnglish = isEnglishLanguage(language)

  questions.forEach(question => {
    const counterKey = isJapanese
      ? question.isListening
        ? `listening:${question.sectionKey}`
        : 'non-listening'
      : isEnglish
        ? question.isListening
          ? 'listening'
          : 'non-listening'
        : question.sectionKey
    const number = (counters.get(counterKey) || 0) + 1
    counters.set(counterKey, number)
    numbers.set(question.id, number)
  })

  return numbers
}
