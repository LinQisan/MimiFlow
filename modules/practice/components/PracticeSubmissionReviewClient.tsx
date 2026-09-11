'use client'

import { PracticePlayer } from '@/modules/practice/components/PracticePlayer'
import type { ExamQuestion } from '@/modules/questions/components/question-renderer/types'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import type { PaperWordbookDistribution } from '@/modules/practice/domain/paper-word-frequency'

type SubmissionItem = {
  question: ExamQuestion
  attempt: {
    questionId: string
    isCorrect: boolean
    selectedOptionId: string | null
    correctOptionId: string | null
    timeSpentMs: number
  }
}

type SubmissionSummary = {
  id: string
  questionCount: number
  correctCount: number
  languageScore: number | null
  readingScore: number | null
  listeningScore: number | null
  totalScore: number | null
  passed: boolean | null
  completedAt: Date | string
}

export default function PracticeSubmissionReviewClient({
  paperId,
  paperTitle,
  paperLanguage,
  submission,
  submissionItems,
  initialQuestionId,
  pronunciationMap,
  sudachiPronunciationMap,
  sudachiLexicon,
  sudachiAvailable,
  vocabularyMetaMap,
  wordbookDistribution = null,
}: {
  paperId: string
  paperTitle: string
  paperLanguage: string | null
  submission: SubmissionSummary
  submissionItems: SubmissionItem[]
  initialQuestionId?: string
  pronunciationMap: Record<string, string>
  sudachiPronunciationMap: Record<string, string>
  sudachiLexicon: Record<string, SudachiLexeme>
  sudachiAvailable: boolean
  vocabularyMetaMap: Record<string, VocabularyMeta>
  wordbookDistribution?: PaperWordbookDistribution | null
}) {
  const initialAnswers = submissionItems.reduce<Record<string, string>>(
    (answers, item) => {
      if (item.attempt.selectedOptionId) {
        answers[item.question.id] = item.attempt.selectedOptionId
      }
      return answers
    },
    {},
  )
  const correctQuestionIds = submissionItems
    .filter(item => item.attempt.isCorrect)
    .map(item => item.question.id)
  const wrongQuestionIds = submissionItems
    .filter(item => !item.attempt.isCorrect)
    .map(item => item.question.id)
  const requestedIndex = initialQuestionId
    ? submissionItems.findIndex(item => item.question.id === initialQuestionId)
    : -1
  const firstWrongIndex = submissionItems.findIndex(
    item => !item.attempt.isCorrect,
  )
  const initialIndex = Math.max(
    0,
    requestedIndex >= 0 ? requestedIndex : firstWrongIndex,
  )
  const scoreLabel =
    submission.totalScore === null ? '' : ` · ${submission.totalScore}/180`

  return (
    <PracticePlayer
      questions={submissionItems.map(item => item.question)}
      paperTitle={`${paperTitle} · 错题回看${scoreLabel}`}
      paperLanguage={paperLanguage}
      mode='history'
      initialIndex={initialIndex}
      exitHref={`/practice/${encodeURIComponent(paperId)}`}
      exitLabel='返回做题记录'
      restoreDraftIndex={false}
      historyPositionKey={`practice:submission:${submission.id}:last-question`}
      restoreHistoryPosition={requestedIndex < 0}
      pronunciationMap={pronunciationMap}
      sudachiPronunciationMap={sudachiPronunciationMap}
      sudachiLexicon={sudachiLexicon}
      sudachiAvailable={sudachiAvailable}
      vocabularyMetaMap={vocabularyMetaMap}
      initialAnswers={initialAnswers}
      initialSubmitted
      historyCorrectQuestionIds={correctQuestionIds}
      historyWrongQuestionIds={wrongQuestionIds}
      initialWordbookDistribution={wordbookDistribution}
    />
  )
}
