// app/admin/manage/DeleteButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteCategory } from './action'

export default function DeleteButton({
  categoryId,
  categoryName,
}: {
  categoryId: string
  categoryName: string
}) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    // 危险操作前必须要二次确认
    if (
      confirm(
        `🚨 危险操作！\n\n确定要彻底删除【${categoryName}】吗？\n删除后，该试卷下的所有音频题目和字幕都将被永久销毁！`,
      )
    ) {
      startTransition(async () => {
        const result = await deleteCategory(categoryId)
        if (!result.success) {
          alert(result.message)
        }
      })
    }
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
