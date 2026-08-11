import Link from 'next/link'
import { notFound } from 'next/navigation'

import LessonQuestionsPanel from '@/features/collections/ui/LessonQuestionsPanel'
import LessonSiblingNav from '@/features/collections/ui/LessonSiblingNav'
import DeleteAudioMaterialButton from '@/features/listening/ui/DeleteAudioMaterialButton'
import ManageAudioPlayer from '@/features/listening/ui/ManageAudioPlayer'
import ListeningTitleForm from '@/features/listening/ui/ListeningTitleForm'
import ListeningTranscriptEditor from '@/features/listening/ui/ListeningTranscriptEditor'
import { getListeningEditData } from '@/lib/repositories/collection/manage'
import QuestionSectionAnchor from './QuestionSectionAnchor'

export default async function ManageAudioMaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const material = await getListeningEditData(id)
  if (!material) return notFound()

  return (
    <main className='min-h-screen bg-slate-50 pb-16 text-slate-900'>
      <div className='mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8'>
        <Link
          href='/manage/listening'
          className='text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
          ← 听力材料
        </Link>

        <header className='mt-4 mb-5'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <h1 className='text-2xl font-black tracking-tight text-slate-950 md:text-3xl'>
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

        <LessonSiblingNav
          lessons={material.siblings}
          currentLessonId={material.id}
          hrefBase='/manage/listening'
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
            initialDialogues={material.dialogues}
          />
        </section>

        <details className='group mt-8 rounded-2xl border border-slate-200 bg-white'>
          <summary className='flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 marker:content-none'>
            <span>材料设置</span>
            <span className='text-xs text-slate-400 group-open:hidden'>展开</span>
            <span className='hidden text-xs text-slate-400 group-open:inline'>收起</span>
          </summary>
          <div className='space-y-4 border-t border-slate-100 p-4'>
            <ListeningTitleForm id={material.id} title={material.title} />
            <div className='border-t border-slate-100 pt-4'>
              <DeleteAudioMaterialButton
                id={material.id}
                title={material.title}
                materialType='LISTENING'
                questionCount={material.questions.length}
                collectionLabel={material.collectionTitle}
                isExamMaterial={material.collectionType === 'PAPER'}
                redirectAfterDelete
              />
            </div>
          </div>
        </details>
      </div>
    </main>
  )
}
