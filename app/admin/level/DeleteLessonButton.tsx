// app/admin/manage/DeleteLessonButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteLesson } from './action'
import { useDialog } from '@/context/DialogContext'

export default function DeleteLessonButton({
  lessonId,
  title,
}: {
  lessonId: string
  title: string
}) {
  const dialog = useDialog()
  const [isPending, startTransition] = useTransition()

  const handleDelete = async () => {
    const shouldDelete = await dialog.confirm(
      `确定要删除题目【${title}】吗？\n相关音频记录和字幕会被永久删除。`,
      { title: '删除题目', danger: true, confirmText: '删除' },
    )
    if (!shouldDelete) return

    startTransition(async () => {
      const res = await deleteLesson(lessonId)
      if (!res.success) await dialog.alert(res.message)
    })
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
