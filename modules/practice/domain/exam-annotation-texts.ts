type AnnotatableExamQuestion = {
  prompt?: string | null
  contextSentence?: string | null
  passage?: { content?: string | null } | null
  options?: Array<{ text?: string | null }>
  lesson?: {
    dialogues?: Array<{ text?: string | null }>
  } | null
}

export const buildExamAnnotationTexts = (
  questions: AnnotatableExamQuestion[],
) => {
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
