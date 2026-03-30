'use client'

import { useTransition } from 'react'
import { moveLesson } from './action'

type CategoryOption = {
  id: string
  name: string
  levelTitle: string
}

export default function MoveLessonSelect({
  lessonId,
  currentCategoryId,
  allCategories,
}: {
  lessonId: string
  currentCategoryId: string
  allCategories: CategoryOption[]
}) {
  const [isPending, startTransition] = useTransition()

  const handleMove = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetCategoryId = e.target.value
    if (!targetCategoryId || targetCategoryId === currentCategoryId) return

    const confirmMove = confirm(`确定要将这道题移动到新组吗？`)
    if (confirmMove) {
      startTransition(async () => {
        const res = await moveLesson(lessonId, targetCategoryId)
        if (!res.success) alert(res.message)
      })
    } else {
      // 如果取消，把下拉框重置回当前组
      e.target.value = currentCategoryId
    }
  }

  return (
    <div className='relative inline-block ml-2'>
      <select
        value={currentCategoryId}
        onChange={handleMove}
        disabled={isPending}
        className={`text-xs pl-2 pr-6 py-1.5 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer appearance-none ${
          isPending ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        title='移动到其他试卷组'>
        {allCategories.map(cat => (
          <option key={cat.id} value={cat.id}>
            📂 移动至: {cat.levelTitle} - {cat.name}
          </option>
        ))}
      </select>
      {/* 简单的自定义下拉箭头 */}
      <div className='pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-gray-400'>
        <svg className='fill-current h-3 w-3' viewBox='0 0 20 20'>
          <path d='M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z' />
        </svg>
      </div>
    </div>
  )
}
