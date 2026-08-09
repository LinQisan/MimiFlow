import Link from 'next/link'
import { notFound } from 'next/navigation'

import LessonQuestionsPanel from '@/app/(library)/collections/lesson/[lessonId]/LessonQuestionsPanel'
import LessonSiblingNav from '@/app/(library)/collections/lesson/[lessonId]/LessonSiblingNav'
import {
  getListeningEditData,
} from '@/lib/repositories/collection/manage'
import ListeningTitleForm from '@/app/(study)/listening/manage/ListeningTitleForm'
import DeleteAudioMaterialButton from '../DeleteAudioMaterialButton'
import QuestionSectionAnchor from './QuestionSectionAnchor'

export default async function ManageAudioMaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const material = await getListeningEditData(id)
  if (!material) return notFound()

  const isListening = true

  return (
    <main className='min-h-screen bg-slate-50 px-3 py-4 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <nav
          aria-label='面包屑'
          className='flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 md:text-sm'>
          <Link
            href='/manage/listening'
            className='text-indigo-600 hover:text-indigo-800'>
            ← 返回听力材料
          </Link>
          <span className='text-slate-300'>/</span>
          <span>{material.collectionTitle}</span>
          <span className='text-slate-300'>/</span>
          <span className='truncate text-slate-400'>{material.title}</span>
        </nav>

        <LessonSiblingNav
          lessons={material.siblings}
          currentLessonId={material.id}
          hrefBase='/manage/listening'
        />

        <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    isListening
                      ? 'bg-cyan-50 text-cyan-700'
                      : 'bg-violet-50 text-violet-700'
                  }`}>
                  {isListening ? '听力材料' : '跟读材料'}
                </span>
                {isListening && (
                  <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>
                    {material.questions.length} 题
                  </span>
                )}
                <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>
                  {material.dialogues.length} 句文本
                </span>
              </div>
              <h1 className='mt-3 text-2xl font-black text-slate-950 md:text-3xl'>
                {material.title}
              </h1>
              <p className='mt-1 text-sm text-slate-500'>
                所属：{material.collectionTitle}
              </p>
            </div>
            <div className='flex shrink-0 flex-wrap gap-2'>
              {isListening && (
                <a href='#questions' className='ui-btn ui-btn-sm ui-btn-primary'>
                  {material.questions.length === 0 ? '立即添加题目' : '管理题目'}
                </a>
              )}
              <Link
                href={`/listening/${material.id}`}
                className='ui-btn ui-btn-sm'>
                试听
              </Link>
              {isListening && material.collectionId && (
                <Link
                  href={`/manage/practice/${material.collectionId}`}
                  className='ui-btn ui-btn-sm'>
                  查看所属试卷
                </Link>
              )}
              <DeleteAudioMaterialButton
                id={material.id}
                title={material.title}
                materialType={isListening ? 'LISTENING' : 'SPEAKING'}
                questionCount={material.questions.length}
                collectionLabel={material.collectionTitle}
                isExamMaterial={material.collectionType === 'PAPER'}
                redirectAfterDelete
              />
            </div>
          </div>

          <div className='mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]'>
            <ListeningTitleForm id={material.id} title={material.title} />
            <div className='min-w-0 rounded-xl bg-slate-50 p-3'>
              <p className='text-[11px] font-bold tracking-wide text-slate-400 uppercase'>
                音频
              </p>
              {material.audioFile ? (
                <>
                  <audio
                    controls
                    preload='metadata'
                    src={material.audioFile}
                    className='mt-2 h-9 w-full'
                  />
                  <p className='mt-2 truncate font-mono text-[11px] text-slate-500'>
                    {material.audioFile}
                  </p>
                </>
              ) : (
                <p className='mt-2 text-sm font-semibold text-rose-600'>音频未设置</p>
              )}
            </div>
          </div>
        </section>

        {isListening ? (
          <QuestionSectionAnchor>
            <div className='rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm leading-6 text-slate-700'>
              在这里新增、编辑、排序或删除听力题。修改完成后，点击题目区右上角的“保存题目”。
            </div>
            <LessonQuestionsPanel
              lessonId={material.id}
              initialQuestions={material.questions}
              defaultListeningSectionNumber={
                material.listeningSectionNumber || ''
              }
            />
          </QuestionSectionAnchor>
        ) : (
          <section className='rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm leading-6 text-slate-700'>
            跟读材料不要求配置选择题；这里主要维护标题、音频和跟读文本。
          </section>
        )}

        <details className='group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
          <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-slate-800 marker:content-none md:px-5'>
            <span>音频文本与时间轴</span>
            <span className='text-xs font-semibold text-slate-400 group-open:hidden'>
              {material.dialogues.length} 句 · 展开
            </span>
            <span className='hidden text-xs font-semibold text-slate-400 group-open:inline'>
              收起
            </span>
          </summary>
          <div className='border-t border-slate-200'>
            <div className='hidden border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 md:grid md:grid-cols-[9rem_1fr]'>
              <span className='text-right'>时间轴（秒）</span>
              <span className='pl-4'>文本内容</span>
            </div>
            <div className='divide-y divide-slate-100 px-3 md:px-4'>
              {material.dialogues.length === 0 ? (
                <div className='py-10 text-center text-sm text-slate-400'>
                  暂无文本数据
                </div>
              ) : (
                material.dialogues.map(dialogue => (
                  <div
                    key={`${dialogue.id}-${dialogue.start}-${dialogue.end}`}
                    className='grid gap-1 py-3 md:grid-cols-[9rem_1fr] md:gap-4'>
                    <div className='font-mono text-xs font-semibold text-cyan-700 md:text-right'>
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
      </div>
    </main>
  )
}
