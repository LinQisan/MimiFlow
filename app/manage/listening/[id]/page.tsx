import Link from 'next/link'
import { notFound } from 'next/navigation'

import LessonQuestionsPanel from '@/modules/content/collections/components/LessonQuestionsPanel'
import LessonSiblingNav from '@/modules/content/collections/components/LessonSiblingNav'
import DeleteAudioMaterialButton from '@/modules/listening/components/DeleteAudioMaterialButton'
import ManageAudioPlayer from '@/modules/listening/components/ManageAudioPlayer'
import ListeningAudioProvider from '@/modules/listening/components/ListeningAudioProvider'
import ListeningTitleForm from '@/modules/listening/components/ListeningTitleForm'
import ListeningTranscriptEditor from '@/modules/listening/components/ListeningTranscriptEditor'
import { getListeningEditData } from '@/lib/repositories/collection/manage'
import QuestionSectionAnchor from '@/modules/questions/components/QuestionSectionAnchor'

export default async function ManageAudioMaterialEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    returnPage?: string | string[]
    returnTo?: string | string[]
  }>
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const returnPageValue = Array.isArray(resolvedSearchParams.returnPage)
    ? resolvedSearchParams.returnPage[0]
    : resolvedSearchParams.returnPage
  const returnPage = Math.max(
    1,
    Number.parseInt(returnPageValue || '1', 10) || 1,
  )
  const rawReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo
  const safeReturnTo =
    rawReturnTo?.startsWith('/manage/practice/') ||
    rawReturnTo?.startsWith('/manage/listening')
      ? rawReturnTo
      : undefined
  const returnHref =
    safeReturnTo ||
    (returnPage > 1 ? `/manage/listening?page=${returnPage}` : '/manage/listening')
  const returnLabel = safeReturnTo?.startsWith('/manage/practice/')
    ? '返回试卷'
    : '听力材料'
  const siblingHrefQuery = safeReturnTo
    ? `?returnTo=${encodeURIComponent(safeReturnTo)}`
    : returnPage > 1
      ? `?returnPage=${returnPage}`
      : ''
  const material = await getListeningEditData(id)
  if (!material) return notFound()

  return (
    <main className='min-h-screen bg-slate-50 pb-16 text-slate-900'>
      <ListeningAudioProvider src={material.audioFile}>
        <div className='mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8'>
          <Link
            href={returnHref}
            className='text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
            ← {returnLabel}
          </Link>

          <header className='mt-4 mb-5'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0'>
                <h1 className='text-2xl font-bold tracking-tight text-slate-950 md:text-3xl'>
                  {material.title}
                </h1>
                <p className='mt-1 text-sm text-slate-500'>
                  {material.collectionTitle} · {material.questions.length} 题 ·{' '}
                  {material.dialogues.length} 句
                </p>
              </div>
              <div className='flex shrink-0 flex-wrap gap-2'>
                <Link href={`/listening/${material.id}`} className='ui-btn ui-btn-sm'>
                  试听
                </Link>
                {material.audioFile ? (
                  <a
                    href={material.audioFile}
                    download
                    className='ui-btn ui-btn-sm'>
                    下载音频
                  </a>
                ) : null}
                {material.collectionId ? (
                  <Link
                    href={`/manage/practice/${material.collectionId}`}
                    className='ui-btn ui-btn-sm'>
                    所属试卷
                  </Link>
                ) : null}
              </div>
            </div>

            <div className='mt-4'>
              {material.audioFile ? (
                <ManageAudioPlayer src={material.audioFile} />
              ) : (
                <p className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600'>
                  音频未设置
                </p>
              )}
            </div>
          </header>

          <section className='mb-5 border-y border-slate-200 py-4'>
            <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
              <h2 className='ui-section-head'>材料信息</h2>
              <span className='rounded-full border border-sky-100 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700'>
                标题会同步显示在试卷中
              </span>
            </div>
            <ListeningTitleForm id={material.id} title={material.title} />
          </section>

          <LessonSiblingNav
            lessons={material.siblings}
            currentLessonId={material.id}
            hrefBase='/manage/listening'
            hrefQuery={siblingHrefQuery}
            appearance='practice'
          />

          <QuestionSectionAnchor>
            <LessonQuestionsPanel
              lessonId={material.id}
              initialQuestions={material.questions}
              defaultListeningSectionNumber={
                material.listeningSectionNumber || ''
              }
              appearance='practice'
            />
          </QuestionSectionAnchor>

          <section className='mt-8'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='text-lg font-bold tracking-tight text-slate-950'>文本</h2>
              <span className='text-xs text-slate-500'>{material.dialogues.length} 句</span>
            </div>
            <ListeningTranscriptEditor
              materialId={material.id}
              materialTitle={material.title}
              initialDialogues={material.dialogues}
            />
          </section>

          <details className='group mt-8 border-y border-slate-200 py-4'>
            <summary className='flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 marker:content-none'>
              <span>危险操作</span>
              <span className='text-xs text-slate-400 group-open:hidden'>展开</span>
              <span className='hidden text-xs text-slate-400 group-open:inline'>收起</span>
            </summary>
            <div className='border-t border-slate-100 p-4'>
              <DeleteAudioMaterialButton
                id={material.id}
                title={material.title}
                materialType='LISTENING'
                questionCount={material.questions.length}
                collectionLabel={material.collectionTitle}
                isExamMaterial={material.collectionType === 'PAPER'}
                redirectAfterDelete
                redirectHref={returnHref}
              />
            </div>
          </details>
        </div>
      </ListeningAudioProvider>
    </main>
  )
}
