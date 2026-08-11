import Link from 'next/link'
import { notFound } from 'next/navigation'

import LessonQuestionsPanel from '@/features/collections/ui/LessonQuestionsPanel'
import LessonSiblingNav from '@/features/collections/ui/LessonSiblingNav'
import {
  getListeningEditData,
} from '@/lib/repositories/collection/manage'
import ListeningTitleForm from '@/features/listening/ui/ListeningTitleForm'
import DeleteAudioMaterialButton from '@/features/listening/ui/DeleteAudioMaterialButton'
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
    <main className='min-h-screen bg-[#f6f5f1] pb-16 font-sans text-slate-900'>
      <div className='mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10'>
        <nav
          aria-label='面包屑'
          className='mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 md:text-sm'>
          <Link
            href='/manage/listening'
            className='text-slate-700 transition hover:text-slate-950'>
            ← 返回听力材料
          </Link>
          <span className='text-slate-300'>/</span>
          <span>{material.collectionTitle}</span>
          <span className='text-slate-300'>/</span>
          <span className='truncate text-slate-400'>{material.title}</span>
        </nav>

        <header className='mb-6 overflow-hidden rounded-[20px] bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
          <div className='grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-start'>
            <div className='min-w-0'>
              <p className='text-xs font-bold uppercase tracking-[0.18em] text-slate-400'>
                听力材料
              </p>
              <h1 className='mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl'>
                {material.title}
              </h1>
              <p className='mt-2 text-sm text-slate-500'>
                所属：{material.collectionTitle}
              </p>
              <div className='mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500'>
                <span>
                  题目{' '}
                  <strong className='ml-1 font-semibold text-slate-900'>
                    {material.questions.length}
                  </strong>
                </span>
                <span>
                  文本{' '}
                  <strong className='ml-1 font-semibold text-slate-900'>
                    {material.dialogues.length} 句
                  </strong>
                </span>
                <span>
                  所属問題{' '}
                  <strong className='ml-1 font-semibold text-slate-900'>
                    {material.listeningSectionNumber || '未设置'}
                  </strong>
                </span>
              </div>
              <div className='mt-6 flex flex-wrap gap-2'>
                <a href='#questions' className='ui-btn ui-btn-sm ui-btn-primary'>
                  {material.questions.length === 0 ? '立即添加题目' : '管理题目'}
                </a>
                <Link href={`/listening/${material.id}`} className='ui-btn ui-btn-sm'>
                  试听页面
                </Link>
                {material.collectionId ? (
                  <Link
                    href={`/manage/practice/${material.collectionId}`}
                    className='ui-btn ui-btn-sm'>
                    查看所属试卷
                  </Link>
                ) : null}
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

            <div className='rounded-2xl bg-slate-50 p-4 shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)]'>
              <p className='text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400'>
                音频预览
              </p>
              {material.audioFile ? (
                <>
                  <audio
                    controls
                    preload='metadata'
                    src={material.audioFile}
                    className='mt-3 h-10 w-full'
                  />
                  <p className='mt-3 truncate font-mono text-[11px] text-slate-400'>
                    {material.audioFile}
                  </p>
                </>
              ) : (
                <p className='mt-2 text-sm font-semibold text-rose-600'>音频未设置</p>
              )}
            </div>
          </div>

          <div className='border-t border-slate-100 p-5 md:px-6 md:py-5'>
            <ListeningTitleForm id={material.id} title={material.title} />
          </div>
        </header>

        <LessonSiblingNav
          lessons={material.siblings}
          currentLessonId={material.id}
          hrefBase='/manage/listening'
          appearance='practice'
        />

        <QuestionSectionAnchor>
          <section className='pt-4'>
            <div className='mb-5 flex items-end justify-between gap-4 border-b border-slate-900/10 pb-3'>
              <div>
                <p className='text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400'>
                  Question editor
                </p>
                <h2 className='mt-1 text-xl font-semibold tracking-tight text-slate-950'>
                  听力题目
                </h2>
              </div>
              <span className='text-xs font-medium text-slate-500'>
                拖拽排序 · 统一保存
              </span>
            </div>
            <LessonQuestionsPanel
              lessonId={material.id}
              initialQuestions={material.questions}
              defaultListeningSectionNumber={
                material.listeningSectionNumber || ''
              }
              appearance='practice'
            />
          </section>
        </QuestionSectionAnchor>

        <section className='mt-10'>
          <div className='mb-5 flex items-end justify-between gap-4 border-b border-slate-900/10 pb-3'>
            <div>
              <p className='text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400'>
                Transcript
              </p>
              <h2 className='mt-1 text-xl font-semibold tracking-tight text-slate-950'>
                音频文本与时间轴
              </h2>
            </div>
            <span className='text-xs font-medium text-slate-500'>
              {material.dialogues.length} 句
            </span>
          </div>

          <details className='group overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 marker:content-none md:px-6'>
              <span>查看逐句文本</span>
              <span className='text-xs font-medium text-slate-400 group-open:hidden'>展开</span>
              <span className='hidden text-xs font-medium text-slate-400 group-open:inline'>收起</span>
            </summary>
            <div className='border-t border-slate-100'>
              <div className='hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid md:grid-cols-[9rem_1fr] md:px-6'>
                <span className='text-right'>时间轴（秒）</span>
                <span className='pl-4'>文本内容</span>
              </div>
              <div className='divide-y divide-slate-100 px-4 md:px-6'>
                {material.dialogues.length === 0 ? (
                  <div className='py-10 text-center text-sm text-slate-400'>
                    暂无文本数据
                  </div>
                ) : (
                  material.dialogues.map(dialogue => (
                    <div
                      key={`${dialogue.id}-${dialogue.start}-${dialogue.end}`}
                      className='grid gap-1 py-3.5 md:grid-cols-[9rem_1fr] md:gap-4'>
                      <div className='font-mono text-xs font-semibold tabular-nums text-slate-500 md:text-right'>
                        {dialogue.start.toFixed(2)} → {dialogue.end.toFixed(2)}
                      </div>
                      <p className='text-sm leading-6 text-slate-800'>
                        {dialogue.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
  )
}
