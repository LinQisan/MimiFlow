// app/admin/manage/DeleteLessonButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteLesson } from './action'

export default function DeleteLessonButton({
  lessonId,
  title,
}: {
  lessonId: string
  title: string
}) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (
      confirm(
        `确定要删除题目【${title}】吗？\n相关的音频记录和所有字幕都将被永久删除！`,
      )
    ) {
      startTransition(async () => {
        const res = await deleteLesson(lessonId)
        if (!res.success) alert(res.message)
      })
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className={`text-xs px-3 py-1.5 rounded transition-colors ml-2 ${
        isPending
          ? 'bg-gray-100 text-gray-400'
          : 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600'
      }`}>
      {isPending ? '...' : '🗑️ 删除单题'}
    </button>
  )
}
