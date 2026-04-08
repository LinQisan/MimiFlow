import Link from 'next/link'
import { notFound } from 'next/navigation'

import LessonQuestionsPanel from './LessonQuestionsPanel'
import LessonSiblingNav from './LessonSiblingNav'
import { getListeningEditData } from '@/lib/repositories/collection-manage.repo'

export default async function ManageCollectionLessonEditPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const { lessonId } = await params
  const lesson = await getListeningEditData(lessonId)
  if (!lesson) return notFound()

  return (
    <main className='min-h-screen bg-gray-50 px-3 py-4 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <div className='mb-4 flex items-center gap-2 text-xs font-semibold md:mb-6 md:text-sm'>
          <Link
            href={`/manage/collection/${lesson.collectionId}`}
            className='text-indigo-600 hover:text-indigo-700'>
            返回分组
          </Link>
          <span className='text-gray-300'>/</span>
          <span className='text-gray-500'>{lesson.collectionTitle}</span>
          <span className='text-gray-300'>/</span>
          <span className='text-gray-400'>{lesson.title}</span>
        </div>

        <LessonSiblingNav lessons={lesson.siblings} currentLessonId={lesson.id} />

        <section className='mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:mb-6 md:p-6'>
          <h1 className='text-2xl font-black text-gray-800 md:text-3xl'>{lesson.title}</h1>
          <p className='text-xs text-gray-500 md:text-sm'>所属分组：{lesson.collectionTitle}</p>
          <p className='mt-2 inline-block rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-500 break-all md:text-xs'>
            音频：{lesson.audioFile || '未设置'}
          </p>
        </section>

        <section className='overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
          <div className='hidden border-b border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-600 md:flex'>
            <div className='w-32 text-right mr-4 shrink-0'>时间轴 (秒)</div>
            <div>字幕文本内容</div>
          </div>
          <div className='space-y-2 p-2 md:space-y-1.5 md:p-3'>
            {lesson.dialogues.length === 0 ? (
              <div className='text-center py-10 text-gray-400'>暂无字幕数据</div>
            ) : (
              lesson.dialogues.map(dialogue => (
                <div
                  key={`${dialogue.id}-${dialogue.start}-${dialogue.end}`}
                  className='group rounded-lg border border-transparent p-2 transition-colors hover:border-gray-200 hover:bg-gray-50 md:flex md:items-center md:gap-4'>
                  <div className='mb-1 flex min-w-[8rem] shrink-0 items-center gap-2 font-mono text-xs font-semibold text-blue-700 md:mb-0 md:w-32 md:justify-end'>
                    <span>{dialogue.start.toFixed(2)}</span>
                    <span className='text-gray-300'>→</span>
                    <span>{dialogue.end.toFixed(2)}</span>
                  </div>
                  <p className='text-sm text-gray-800 md:text-base'>{dialogue.text}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <LessonQuestionsPanel lessonId={lesson.id} initialQuestions={lesson.questions} />
      </div>
    </main>
  )
}

