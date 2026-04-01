// app/quizzes/[id]/page.tsx
import { notFound } from 'next/navigation'
import QuizEngineUI from '../QuizEngineUI'
import prisma from '@/lib/prisma'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabularyMeta'

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
          // 用于前端统计正确率
          attempts: { select: { isCorrect: true } },
        },
      },
    },
  })

  if (!quiz) return notFound()

  const questionIds = quiz.questions.map(q => q.id)
  const relatedVocab = await prisma.vocabulary.findMany({
    where: {
      sentenceLinks: {
        some: {
          sentence: {
            sourceType: 'QUIZ_QUESTION',
            sourceId: { in: questionIds },
          },
        },
      },
    },
    select: {
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
      sentenceLinks: {
        where: {
          sentence: {
            sourceType: 'QUIZ_QUESTION',
            sourceId: { in: questionIds },
          },
        },
        include: { sentence: true },
      },
    },
  })
  const vocabularyMetaMapByQuestion = relatedVocab.reduce<
    Record<string, Record<string, VocabularyMeta>>
  >((acc, item) => {
    const meta = toVocabularyMeta(item)
    item.sentenceLinks.forEach(link => {
      const sourceId = link.sentence.sourceId || ''
      if (!sourceId) return
      if (!acc[sourceId]) acc[sourceId] = {}
      acc[sourceId][item.word] = meta
    })
    return acc
  }, {})

  return (
    <QuizEngineUI
      quiz={quiz}
      vocabularyMetaMapByQuestion={vocabularyMetaMapByQuestion}
    />
  )
}
