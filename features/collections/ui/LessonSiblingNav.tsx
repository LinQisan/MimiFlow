// app/collections/lesson/[lessonId]/LessonSiblingNav.tsx
'use client'

import Link from 'next/link'
import {
  SortableList,
  SortableItem,
  DragHandle,
} from '@/features/collections/ui/DndSystem'
import { updateSortOrder } from '@/modules/practice/actions/questions'
import { useDialog } from '@/context/DialogContext'

type SiblingLesson = {
  id: string
  title: string
  _count?: { questions: number }
}

export default function LessonSiblingNav({
  lessons,
  currentLessonId,
  hrefBase = '/manage/listening',
  hrefQuery = '',
  appearance = 'default',
}: {
  lessons: SiblingLesson[]
  currentLessonId: string
  hrefBase?: string
  hrefQuery?: string
  appearance?: 'default' | 'practice'
}) {
  const dialog = useDialog()
  const practiceAppearance = appearance === 'practice'

  const handleReorder = async (orderedIds: string[]) => {
    const res = await updateSortOrder('Lesson', orderedIds)
    if (res.success) {
      dialog.toast('排序已更新', { tone: 'success' })
    }
    return res
  }

  if (lessons.length <= 1) return null

  return (
    <details className='mb-4 border-y border-slate-200 py-3'>
      <summary className='cursor-pointer list-none p-3 md:p-4 flex items-center justify-between text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors [&::-webkit-details-marker]:hidden'>
        <span className='flex items-center gap-2'>
          同组材料
        </span>
        <span className='text-xs font-medium text-slate-400'>
          {lessons.length} 项
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
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${
                    isCurrent
                      ? practiceAppearance
                        ? 'border-slate-300 bg-slate-100'
                        : 'border-indigo-200 bg-indigo-50 shadow-sm'
                      : practiceAppearance
                        ? 'border-slate-100 bg-white hover:border-slate-300'
                        : 'border-gray-100 bg-white hover:border-indigo-200 hover:shadow-sm'
                  }`}>
                  <div className='flex items-center gap-2 text-sm min-w-0'>
                    <DragHandle />
                    {!practiceAppearance ? (
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        isCurrent ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className={`truncate font-bold ${practiceAppearance ? 'text-slate-950' : 'text-indigo-700'}`}>{lesson.title}</span>
                    ) : (
                      <Link
                        href={`${hrefBase}/${lesson.id}${hrefQuery}`}
                        className='font-medium text-gray-700 hover:text-indigo-600 transition-colors truncate'>
                        {lesson.title}
                      </Link>
                    )}
                  </div>
                  {!practiceAppearance ? (
                    <div className='flex items-center gap-2 shrink-0 ml-2'>
                    {(lesson._count?.questions ?? 0) > 0 ? (
                      <span className='rounded-md border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700'>
                        {lesson._count?.questions} 题
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <span className='text-[10px] font-bold text-indigo-500'>当前</span>
                    ) : null}
                    </div>
                  ) : null}
                </div>
              </SortableItem>
            )
          })}
        </SortableList>
      </div>
    </details>
  )
}
