// app/manage/collection/lesson/[lessonId]/LessonSiblingNav.tsx
'use client'

import Link from 'next/link'
import {
  SortableList,
  SortableItem,
  DragHandle,
} from '@/app/manage/collection/DndSystem'
import { updateSortOrder } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

type SiblingLesson = {
  id: string
  title: string
  _count?: { questions: number }
}

export default function LessonSiblingNav({
  lessons,
  currentLessonId,
  hrefBase = '/manage/collection/lesson',
}: {
  lessons: SiblingLesson[]
  currentLessonId: string
  hrefBase?: string
}) {
  const dialog = useDialog()

  const handleReorder = async (orderedIds: string[]) => {
    const res = await updateSortOrder('Lesson', orderedIds)
    if (res.success) {
      dialog.toast('排序已更新', { tone: 'success' })
    }
    return res
  }

  if (lessons.length <= 1) return null

  return (
    <details className='mb-4 rounded-2xl border border-gray-200 bg-white shadow-sm'>
      <summary className='cursor-pointer list-none p-3 md:p-4 flex items-center justify-between text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors [&::-webkit-details-marker]:hidden'>
        <span className='flex items-center gap-2'>
          <svg className='w-4 h-4 text-gray-400 transition-transform duration-300 group-open:-rotate-180' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M19 9l-7 7-7-7' />
          </svg>
          同组听力列表
        </span>
        <span className='rounded-md border border-gray-100 bg-gray-50 px-2 py-0.5 text-[11px] font-bold text-gray-500'>
          {lessons.length} 项 · 拖拽排序
        </span>
      </summary>

      <div className='border-t border-gray-100 p-3 md:p-4 bg-gray-50/30'>
        <SortableList
          items={lessons}
          action={handleReorder}
          className='space-y-1.5'>
          {lessons.map((lesson, i) => {
            const isCurrent = lesson.id === currentLessonId
            return (
              <SortableItem key={lesson.id} id={lesson.id}>
                <div
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-all ${
                    isCurrent
                      ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                      : 'bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-sm'
                  }`}>
                  <div className='flex items-center gap-2 text-sm min-w-0'>
                    <DragHandle />
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                      isCurrent ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {i + 1}
                    </span>
                    {isCurrent ? (
                      <span className='font-bold text-indigo-700 truncate'>{lesson.title}</span>
                    ) : (
                      <Link
                        href={`${hrefBase}/${lesson.id}`}
                        className='font-medium text-gray-700 hover:text-indigo-600 transition-colors truncate'>
                        {lesson.title}
                      </Link>
                    )}
                  </div>
                  <div className='flex items-center gap-2 shrink-0 ml-2'>
                    {(lesson._count?.questions ?? 0) > 0 && (
                      <span className='rounded-md border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700'>
                        {lesson._count?.questions} 题
                      </span>
                    )}
                    {isCurrent && (
                      <span className='text-[10px] font-bold text-indigo-500'>当前</span>
                    )}
                  </div>
                </div>
              </SortableItem>
            )
          })}
        </SortableList>
      </div>
    </details>
  )
}
