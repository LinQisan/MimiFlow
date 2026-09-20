import 'server-only'

import prisma from '@/lib/prisma'
import { CollectionType, MaterialType } from '@prisma/client'
import { normalizeQuestionOptions } from '@/lib/repositories/materials'
import { evaluateSelectedOption } from '@/modules/practice/domain/evaluate-attempt'
import { calculateJlptScore } from '@/modules/practice/domain/jlpt-scoring'
import type { JlptScoreSummary } from '@/modules/practice/domain/jlpt-scoring'
import { getPaperQuestionSectionNumber } from '@/modules/questions/domain/paper-editor'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { readJsonRecord } from '@/lib/validation/schema'
import { resolveListeningSection } from '@/lib/repositories/exam'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { evaluateSortingOrder, resolveCorrectOrderIds } from '@/modules/questions/domain/sorting'
import { parseSortingPrompt } from '@/modules/practice/domain/question-text'

export type QuizAttemptInput = {
  questionId: string
  selectedOptionId?: string
  selectedOrder?: string[]
  timeSpentMs: number
}

type QuizAttemptResult = {
  questionId: string
  selectedOptionId: string
  selectedOrder: string[] | null
  correctOptionId: string | null
  isCorrect: boolean
}

type PracticeSubmissionResult = JlptScoreSummary & {
  id: string
  questionCount: number
  correctCount: number
  completedAt: Date
}

export type QuizAttemptRecordResult = {
  alreadyCompleted?: boolean
  results: QuizAttemptResult[]
  submission: PracticeSubmissionResult | null
}

export type QuizAttemptResetScope =
  | { type: 'all' }
  | { type: 'language'; language: string }
  | { type: 'paper'; paperId: string }

const DAY_IN_MS = 24 * 60 * 60 * 1000

const normalizeAttempt = (input: QuizAttemptInput): QuizAttemptInput => ({
  questionId: String(input.questionId || '').trim(),
  selectedOptionId: String(input.selectedOptionId || '').trim(),
  selectedOrder: Array.isArray(input.selectedOrder)
    ? input.selectedOrder.map(value => String(value || '').trim())
    : undefined,
  timeSpentMs: Math.min(
    24 * 60 * 60 * 1000,
    Math.max(0, Math.floor(Number(input.timeSpentMs) || 0)),
  ),
})

export async function recordQuizAttempts(
  inputs: QuizAttemptInput[],
  options: { completedPaperId?: string; customSessionId?: string } = {},
): Promise<QuizAttemptRecordResult> {
  const userId = await getCurrentUserId()
  const normalized = inputs
    .map(normalizeAttempt)
    .filter(item => item.questionId && (item.selectedOptionId || item.selectedOrder?.length))

  const customSessionId = options.customSessionId?.trim()
  const customSession = customSessionId
    ? await prisma.customPracticeSession.findFirst({ where: { id: customSessionId, userId } })
    : null
  if (customSessionId && !customSession) throw new Error('自定义练习不存在')
  if (customSession && options.completedPaperId) throw new Error('提交类型不一致')
  if (customSession?.completedAt) {
    return { results: [], submission: null, alreadyCompleted: true }
  }
  if (customSession && normalized.some(item => !customSession.questionIds.includes(item.questionId))) {
    throw new Error('作答题目不属于当前练习')
  }
  if (!customSession && normalized.length === 0) return { results: [], submission: null }

  const uniqueQuestionIds = Array.from(
    new Set(normalized.map(item => item.questionId)),
  )
  if (uniqueQuestionIds.length !== normalized.length) {
    throw new Error('同一道题不能在一次提交中重复作答')
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: uniqueQuestionIds } },
    select: {
      id: true,
      options: true,
      answer: true,
      questionType: true,
      prompt: true,
      content: true,
    },
  })
  const questionById = new Map(questions.map(question => [question.id, question]))

  const results = normalized.map(input => {
    const question = questionById.get(input.questionId)
    if (!question) throw new Error('题目不存在')

    const options = normalizeQuestionOptions(question.options, question.answer)
    const evaluation =
      question.questionType === 'SORTING'
        ? evaluateSortingOrder({
            options,
            correctOrder: resolveCorrectOrderIds(
              options,
              decodeQuestionContent(question.content).sortingOrder,
            ),
            selectedOrder: input.selectedOrder,
            starIndex: parseSortingPrompt(question.prompt || '').starIndex,
          })
        : evaluateSelectedOption(options, input.selectedOptionId || '')

    return {
      questionId: input.questionId,
      ...evaluation,
      selectedOrder:
        question.questionType === 'SORTING'
          ? input.selectedOrder || null
          : null,
      timeSpentMs: input.timeSpentMs,
    }
  })

  const completedPaperId = String(options.completedPaperId || '').trim()
  let scoreSummary: JlptScoreSummary | null = null
  if (completedPaperId) {
    const paper = await prisma.collection.findFirst({
      where: {
        id: completedPaperId,
        collectionType: CollectionType.PAPER,
      },
      select: {
        level: true,
        language: true,
        materials: {
          select: {
            material: {
              select: {
                type: true,
                title: true,
                chapterName: true,
                contentPayload: true,
                metadata: true,
                questions: {
                  select: {
                    id: true,
                    questionType: true,
                    content: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!paper) {
      throw new Error('整套练习记录与试卷题目不一致')
    }
    const paperQuestionIds = new Set(
      paper.materials.flatMap(item =>
        item.material.questions.map(question => question.id),
      ),
    )
    if (
      paperQuestionIds.size === 0 ||
      paperQuestionIds.size !== uniqueQuestionIds.length ||
      uniqueQuestionIds.some(questionId => !paperQuestionIds.has(questionId))
    ) {
      throw new Error('整套练习记录与试卷题目不一致')
    }

    const resultByQuestionId = new Map(
      results.map(result => [result.questionId, result]),
    )
    const scoredAnswers = paper.materials.flatMap(({ material }) => {
      const payload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      )
      const metadata = readJsonRecord(material.metadata)
      return material.questions.map(question => {
        const problemNumber =
          material.type === MaterialType.LISTENING
            ? resolveListeningSection({
                content: decodeQuestionContent(question.content),
                payload,
                metadata,
                chapterName: material.chapterName || material.title,
                questionType: question.questionType,
                language: paper.language,
              }).partNumber || 1
            : getPaperQuestionSectionNumber(
                material.type,
                question.questionType,
              )
        return {
          section:
            material.type === MaterialType.LISTENING
              ? ('LISTENING' as const)
              : problemNumber <= 7
                ? ('LANGUAGE' as const)
                : ('READING' as const),
          problemNumber,
          isCorrect:
            resultByQuestionId.get(question.id)?.isCorrect || false,
        }
      })
    })
    scoreSummary =
      (paper.level || '').trim().toUpperCase() === 'N1'
        ? calculateJlptScore(scoredAnswers, paper.level)
        : null
  }

  const saved = await prisma.$transaction(async tx => {
    if (customSessionId) {
      const claimed = await tx.customPracticeSession.updateMany({
        where: { id: customSessionId, userId, completedAt: null },
        data: {
          completedAt: new Date(),
          answers: Object.fromEntries(
            results.map(item => [item.questionId, item.selectedOptionId]),
          ),
          sortingOrders: Object.fromEntries(
            results
              .filter(result => result.selectedOrder)
              .map(result => [result.questionId, result.selectedOrder]),
          ),
        },
      })
      if (claimed.count === 0) return { submission: null, alreadyCompleted: true }
    }
    const submission =
      completedPaperId
        ? await tx.practicePaperSubmission.create({
            data: {
              userId,
              collectionId: completedPaperId,
              questionCount: results.length,
              correctCount: results.filter(result => result.isCorrect).length,
              languageScore: scoreSummary?.language.score,
              readingScore: scoreSummary?.reading.score,
              listeningScore: scoreSummary?.listening.score,
              totalScore: scoreSummary?.totalScore,
              passLine: scoreSummary?.passLine,
              passed: scoreSummary?.passed,
            },
          })
        : null

    await tx.questionAttempt.createMany({
      data: results.map(result => ({
        userId,
        questionId: result.questionId,
        submissionId: submission?.id,
        selectedOptionId: result.selectedOptionId,
        correctOptionId: result.correctOptionId,
        selectedOrder: result.selectedOrder || [],
        isCorrect: result.isCorrect,
        timeSpentMs: result.timeSpentMs,
      })),
    })

    const firstRetryDueAt = new Date(Date.now() + DAY_IN_MS)
    for (const result of results) {
      if (result.isCorrect) continue
      await tx.questionRetry.upsert({
        where: {
          userId_questionId: { userId, questionId: result.questionId },
        },
        create: {
          userId,
          questionId: result.questionId,
          stage: 0,
          dueAt: firstRetryDueAt,
          wrongCount: 1,
        },
        update: {
          stage: 0,
          dueAt: firstRetryDueAt,
          wrongCount: { increment: 1 },
        },
      })
    }

    return { submission, alreadyCompleted: false }
  })
  const savedSubmission = saved.submission
  if (saved.alreadyCompleted) return { results: [], submission: null, alreadyCompleted: true }

  const publicResults = results.map(
    (result): QuizAttemptResult => ({
      questionId: result.questionId,
      selectedOptionId: result.selectedOptionId,
      correctOptionId: result.correctOptionId,
      selectedOrder: result.selectedOrder,
      isCorrect: result.isCorrect,
    }),
  )
  return {
    results: publicResults,
    submission:
      savedSubmission && scoreSummary
        ? {
            id: savedSubmission.id,
            questionCount: savedSubmission.questionCount,
            correctCount: savedSubmission.correctCount,
            completedAt: savedSubmission.completedAt,
            ...scoreSummary,
          }
        : null,
  }
}

export async function resetQuizAttemptHistory(
  scope: QuizAttemptResetScope = { type: 'all' },
) {
  const userId = await getCurrentUserId()
  return prisma.$transaction(async tx => {
    if (scope.type === 'all') {
      const attempts = await tx.questionAttempt.deleteMany({ where: { userId } })
      const submissions = await tx.practicePaperSubmission.deleteMany({
        where: { userId },
      })
      // Retry entries are derived from the deleted attempts: keeping them
      // would leave ghost mistakes in /review/mistakes after a reset.
      // Personal notes (UserQuestionNote) and FSRS memory cards are untouched
      // deliberately — they are not attempt history.
      const retries = await tx.questionRetry.deleteMany({ where: { userId } })
      return {
        deletedAttemptCount: attempts.count,
        deletedSubmissionCount: submissions.count,
        deletedRetryCount: retries.count,
      }
    }

    const collectionWhere =
      scope.type === 'paper'
        ? { id: scope.paperId, collectionType: CollectionType.PAPER }
        : { language: scope.language, collectionType: CollectionType.PAPER }
    const papers = await tx.collection.findMany({
      where: collectionWhere,
      select: {
        id: true,
        materials: {
          select: {
            material: {
              select: { questions: { select: { id: true } } },
            },
          },
        },
      },
    })
    const questionIds = Array.from(
      new Set(
        papers.flatMap(paper =>
          paper.materials.flatMap(item =>
            item.material.questions.map(question => question.id),
          ),
        ),
      ),
    )
    const attempts = questionIds.length
      ? await tx.questionAttempt.deleteMany({
          where: { userId, questionId: { in: questionIds } },
        })
      : { count: 0 }
    const submissions = await tx.practicePaperSubmission.deleteMany({
      where: { userId, collectionId: { in: papers.map(paper => paper.id) } },
    })
    const retries = questionIds.length
      ? await tx.questionRetry.deleteMany({
          where: { userId, questionId: { in: questionIds } },
        })
      : { count: 0 }
    return {
      deletedAttemptCount: attempts.count,
      deletedSubmissionCount: submissions.count,
      deletedRetryCount: retries.count,
    }
  })
}
