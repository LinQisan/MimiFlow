// app/admin/manage/DeleteButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteCategory } from './action'
import { useDialog } from '@/context/DialogContext'

export default function DeleteButton({
  categoryId,
  categoryName,
}: {
  categoryId: string
  categoryName: string
}) {
  const dialog = useDialog()
  const [isPending, startTransition] = useTransition()

  const handleDelete = async () => {
    // 危险操作前必须要二次确认
    const shouldDelete = await dialog.confirm(
      `确定要删除【${categoryName}】吗？\n该试卷下的音频题目和字幕会被永久删除。`,
      { title: '删除试卷', danger: true, confirmText: '删除' },
    )
    if (!shouldDelete) return

    startTransition(async () => {
      const result = await deleteCategory(categoryId)
      if (!result.success) {
        await dialog.alert(result.message)
      }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        isPending
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-red-50 text-red-600 hover:bg-red-500 hover:text-white'
      }`}>
      {isPending ? '删除中...' : '删除试卷'}
    </button>
  )
}
