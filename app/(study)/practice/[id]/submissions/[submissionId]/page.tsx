import { notFound } from 'next/navigation'
import { getPracticeSubmissionReview } from '@/lib/repositories/exam'
import PracticeSubmissionReviewClient from '@/features/practice/ui/PracticeSubmissionReviewClient'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import { buildExamAnnotationTexts } from '@/modules/practice/domain/exam-annotation-texts'

export default async function PracticeSubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; submissionId: string }>
  searchParams: Promise<{ qid?: string }>
}) {
  const [{ id, submissionId }, { qid }] = await Promise.all([
    params,
    searchParams,
  ])
  const data = await getPracticeSubmissionReview(id, submissionId)
  if (!data) notFound()
  const questions = data.submissionQuestions.map(item => item.question)
  const normalizedLanguage = (data.paperLanguage || '').trim().toLowerCase()
  const isJapanesePaper =
    normalizedLanguage === 'ja' ||
    normalizedLanguage.startsWith('ja-') ||
    normalizedLanguage.includes('japanese') ||
    /日语|日文|日本语|日本語/.test(data.paperLanguage || '')
  const sudachiPronunciation = isJapanesePaper
    ? await getSudachiPronunciationMap(buildExamAnnotationTexts(questions))
    : { available: false, pronunciationMap: {}, lexicon: {} }

  return (
    <PracticeSubmissionReviewClient
      paperId={id}
      paperTitle={data.paperTitle}
      paperLanguage={data.paperLanguage}
      submission={data.submission}
      submissionItems={data.submissionQuestions}
      initialQuestionId={qid}
      pronunciationMap={data.pronunciationMap}
      sudachiPronunciationMap={sudachiPronunciation.pronunciationMap}
      sudachiLexicon={sudachiPronunciation.lexicon}
      sudachiAvailable={sudachiPronunciation.available}
      vocabularyMetaMap={data.vocabularyMetaMap}
    />
  )
}
