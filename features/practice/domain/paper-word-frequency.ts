type FrequencyQuestion = {
  prompt?: string | null
  contextSentence?: string | null
  options?: string[]
}

type FrequencyMaterial = {
  content?: string | null
  transcript?: string | null
  questions?: FrequencyQuestion[]
}

export type PaperFrequencySource = {
  quizzes: FrequencyMaterial[]
  passages: FrequencyMaterial[]
  lessons: FrequencyMaterial[]
}

export type PaperFrequencySourceStats = {
  questionCount: number
  optionCount: number
  readingTextCount: number
  listeningTranscriptCount: number
}

const questionText = (question: FrequencyQuestion) =>
  Array.from(
    new Set(
      [
        question.prompt,
        question.contextSentence,
        ...(question.options || []),
      ]
        .map(value => (value || '').trim())
        .filter(Boolean),
    ),
  ).join('\n')

export const buildPaperFrequencyDocuments = (
  paper: PaperFrequencySource,
): { texts: string[]; stats: PaperFrequencySourceStats } => {
  const texts: string[] = []
  let questionCount = 0
  let optionCount = 0
  let readingTextCount = 0
  let listeningTranscriptCount = 0

  const appendQuestions = (materials: FrequencyMaterial[]) => {
    materials.forEach(material => {
      const questions = material.questions || []
      questions.forEach(question => {
        questionCount += 1
        optionCount += (question.options || []).filter(Boolean).length
        const text = questionText(question)
        if (text) texts.push(text)
      })
    })
  }

  paper.passages.forEach(passage => {
    const content = (passage.content || '').trim()
    if (!content) return
    readingTextCount += 1
    texts.push(content)
  })
  paper.lessons.forEach(lesson => {
    const transcript = (lesson.transcript || '').trim()
    if (!transcript) return
    listeningTranscriptCount += 1
    texts.push(transcript)
  })
  appendQuestions(paper.quizzes)
  appendQuestions(paper.passages)
  appendQuestions(paper.lessons)

  return {
    texts,
    stats: {
      questionCount,
      optionCount,
      readingTextCount,
      listeningTranscriptCount,
    },
  }
}
