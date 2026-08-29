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

type PaperWordbookDistributionItem = {
  id: string
  name: string
  pathLabel: string
  depth: number
  matchedCount: number
  coverageRate: number
}

export type PaperWordbookDistribution = {
  totalWords: number
  outsideCount: number
  outsideRate: number
  wordbooks: PaperWordbookDistributionItem[]
}

const normalizeWord = (word: string) =>
  word.normalize('NFKC').trim().toLocaleLowerCase('ja')

export const buildPaperWordbookDistribution = ({
  words,
  wordbooks,
  memberships,
}: {
  words: string[]
  wordbooks: Array<{
    id: string
    name: string
    pathLabel: string
    depth: number
  }>
  memberships: Array<{ word: string; wordbookIds: string[] }>
}): PaperWordbookDistribution => {
  const paperWords = new Set(words.map(normalizeWord).filter(Boolean))
  const matchesByWordbook = new Map<string, Set<string>>()
  const matchedWords = new Set<string>()

  memberships.forEach(membership => {
    const word = normalizeWord(membership.word)
    if (!paperWords.has(word) || membership.wordbookIds.length === 0) return
    matchedWords.add(word)
    membership.wordbookIds.forEach(wordbookId => {
      const matches = matchesByWordbook.get(wordbookId) || new Set<string>()
      matches.add(word)
      matchesByWordbook.set(wordbookId, matches)
    })
  })

  const totalWords = paperWords.size
  const rate = (count: number) =>
    totalWords > 0 ? Math.round((count / totalWords) * 1_000) / 10 : 0
  const outsideCount = Math.max(0, totalWords - matchedWords.size)

  return {
    totalWords,
    outsideCount,
    outsideRate: rate(outsideCount),
    wordbooks: wordbooks
      .map(wordbook => {
        const matchedCount = matchesByWordbook.get(wordbook.id)?.size || 0
        return {
          ...wordbook,
          matchedCount,
          coverageRate: rate(matchedCount),
        }
      })
      .filter(wordbook => wordbook.matchedCount > 0),
  }
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
