import { JLPT_PRIORITY, normalizeVocabularyJlptLevels } from '../../../modules/knowledge/vocabulary/domain/jlpt.ts'
import { normalizeVocabularyWord } from '../../../modules/knowledge/vocabulary/domain/normalized-word.ts'

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
  sourceId?: string
  sourceLabel?: string
  matchedCount: number
  coverageRate: number
  matchedWords: string[]
  matchedHeadwords: Record<string, string>
  matchedJlpt: Record<string, string[]>
}

export type PaperWordbookDistribution = {
  totalWords: number
  outsideCount: number
  outsideRate: number
  outsideWords: string[]
  wordbooks: PaperWordbookDistributionItem[]
}

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
    sourceId?: string
    sourceLabel?: string
  }>
  memberships: Array<{
    word: string
    headword?: string
    wordbookIds: string[]
    jlpt?: string | string[] | null
  }>
}): PaperWordbookDistribution => {
  const paperWords = new Set(words.map(normalizeVocabularyWord).filter(Boolean))
  const matchesByWordbook = new Map<string, Set<string>>()
  const headwordsByWordbook = new Map<string, Map<string, string>>()
  const jlptByWordbook = new Map<string, Map<string, Set<string>>>()
  const matchedWords = new Set<string>()

  const parseJlptLevels = (value: string | string[] | null | undefined) =>
    normalizeVocabularyJlptLevels(value)

  const jlptOrder = [...JLPT_PRIORITY]

  memberships.forEach(membership => {
    const word = normalizeVocabularyWord(membership.word)
    if (!paperWords.has(word) || membership.wordbookIds.length === 0) return
    matchedWords.add(word)
    const jlptLevels = parseJlptLevels(membership.jlpt)
    membership.wordbookIds.forEach(wordbookId => {
      const matches = matchesByWordbook.get(wordbookId) || new Set<string>()
      matches.add(word)
      matchesByWordbook.set(wordbookId, matches)
      const headwords = headwordsByWordbook.get(wordbookId) || new Map<string, string>()
      if (!headwords.has(word)) {
        headwords.set(word, membership.headword || membership.word)
      }
      headwordsByWordbook.set(wordbookId, headwords)
      const levelsByWord = jlptByWordbook.get(wordbookId) || new Map<string, Set<string>>()
      const levels = levelsByWord.get(word) || new Set<string>()
      jlptLevels.forEach(level => levels.add(level))
      levelsByWord.set(word, levels)
      jlptByWordbook.set(wordbookId, levelsByWord)
    })
  })

  const totalWords = paperWords.size
  const rate = (count: number) =>
    totalWords > 0 ? Math.round((count / totalWords) * 1_000) / 10 : 0
  const outsideCount = Math.max(0, totalWords - matchedWords.size)
  const sortWords = (values: Iterable<string>) =>
    Array.from(values).sort((left, right) => left.localeCompare(right, 'ja'))

  return {
    totalWords,
    outsideCount,
    outsideRate: rate(outsideCount),
    outsideWords: sortWords(
      Array.from(paperWords).filter(word => !matchedWords.has(word)),
    ),
    wordbooks: wordbooks
      .map(wordbook => {
        const matches = matchesByWordbook.get(wordbook.id) || new Set<string>()
        const matchedCount = matches.size
        return {
          ...wordbook,
          matchedCount,
          coverageRate: rate(matchedCount),
          matchedWords: sortWords(matches),
          matchedHeadwords: Object.fromEntries(
            sortWords(matches).map(word => [
              word,
              headwordsByWordbook.get(wordbook.id)?.get(word) || word,
            ]),
          ),
          matchedJlpt: Object.fromEntries(
            sortWords(matches).map(word => [
              word,
              jlptOrder.filter(level =>
                jlptByWordbook.get(wordbook.id)?.get(word)?.has(level),
              ),
            ]),
          ),
        }
      })
      .filter(wordbook => wordbook.matchedCount > 0)
      .sort(
        (left, right) =>
          right.matchedCount - left.matchedCount ||
          left.depth - right.depth ||
          left.pathLabel.localeCompare(right.pathLabel, 'ja'),
      ),
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
