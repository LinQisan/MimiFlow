// app/admin/manage/DeleteLessonButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteLesson } from './action'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

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
    startTransition(async () => {
      const res = await deleteLesson(lessonId)
      if (!res.success) {
        dialog.toast(res.message || '删除失败', { tone: 'error' })
        return
      }
      dialog.toast('删除成功', { tone: 'success' })
    })
  }

  return (
    <InlineConfirmAction
      message={`确认移除听力《${title}》吗？关联字幕也会一并移除。`}
      onConfirm={handleDelete}
      triggerLabel='移除听力'
      pendingLabel='移除中...'
      confirmLabel='确认移除'
      triggerClassName={`ml-2 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold transition-colors ${
        isPending
          ? 'bg-gray-100 text-gray-400'
          : 'text-red-600 hover:bg-red-100 hover:text-red-700'
      }`}
    />
  )
}
