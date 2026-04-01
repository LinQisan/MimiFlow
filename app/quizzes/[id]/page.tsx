// app/quizzes/[id]/page.tsx
import { notFound } from 'next/navigation'
import QuizEngineUI from '../QuizEngineUI'
import prisma from '@/lib/prisma'

const parseList = (value?: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

export default async function QuizTakingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // 获取整套题及其所有选项
  const resolvedParams = await params
  const quiz = await prisma.quiz.findUnique({
    where: { id: resolvedParams.id },
    include: {
      questions: {
        include: {
          options: true,
          // 🌟 核心：把这道题的全服做题记录拉出来（只需要 isCorrect 字段来算正确率）
          attempts: { select: { isCorrect: true } },
        },
      },
    },
  })

  if (!quiz) return notFound()

  const questionIds = quiz.questions.map(q => q.id)
  const relatedVocab = await prisma.vocabulary.findMany({
    where: {
      sourceType: 'QUIZ_QUESTION',
      sourceId: { in: questionIds },
    },
    select: {
      word: true,
      sourceId: true,
      pronunciation: true,
      pronunciations: true,
      partOfSpeech: true,
      partsOfSpeech: true,
      meanings: true,
    },
  })
  const vocabularyMetaMapByQuestion = relatedVocab.reduce<
    Record<string, Record<string, { pronunciations: string[]; partsOfSpeech: string[]; meanings: string[] }>>
  >((acc, item) => {
    if (!acc[item.sourceId]) acc[item.sourceId] = {}
    const pronunciations = parseList(item.pronunciations)
    const fallback = item.pronunciation?.trim()
    if (fallback && !pronunciations.includes(fallback)) pronunciations.unshift(fallback)
    const partsOfSpeech = parseList(item.partsOfSpeech)
    const fallbackPos = item.partOfSpeech?.trim()
    if (fallbackPos && !partsOfSpeech.includes(fallbackPos)) partsOfSpeech.unshift(fallbackPos)
    acc[item.sourceId][item.word] = {
      pronunciations,
      partsOfSpeech,
      meanings: parseList(item.meanings),
    }
    return acc
  }, {})

  return (
    <QuizEngineUI
      quiz={quiz}
      vocabularyMetaMapByQuestion={vocabularyMetaMapByQuestion}
    />
  )
}
