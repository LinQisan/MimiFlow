import type { ExamQuestion } from '@/components/exam/question-renderer/types'

export const buildExamAnnotationTexts = (questions: ExamQuestion[]) => {
  const texts = new Set<string>()
  const add = (value?: string | null) => {
    const text = (value || '').trim()
    if (text) texts.add(text)
  }

  questions.forEach(question => {
    add(question.prompt)
    add(question.contextSentence)
    add(question.passage?.content)
    question.options?.forEach(option => add(option.text))
    question.lesson?.dialogues?.forEach(dialogue => add(dialogue.text))
  })

  return Array.from(texts)
}
