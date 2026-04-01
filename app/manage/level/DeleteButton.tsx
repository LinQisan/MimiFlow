// app/admin/manage/DeleteButton.tsx
'use client'

import { useTransition } from 'react'
import { deleteCategory } from './action'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

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
    startTransition(async () => {
      const result = await deleteCategory(categoryId)
      if (!result.success) {
        dialog.toast(result.message || '删除失败', { tone: 'error' })
        return
      }
      dialog.toast('删除成功', { tone: 'success' })
    })
  }

  return (
    <InlineConfirmAction
      message={`确认移除分组「${categoryName}」吗？该分组下的语料会一并移除。`}
      onConfirm={handleDelete}
      triggerLabel='移除分组'
      pendingLabel='移除中...'
      confirmLabel='确认移除'
      triggerClassName={`rounded-lg border border-red-100 px-3 py-1.5 text-sm font-semibold transition-colors ${
        isPending
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700'
      }`}
    />
  )
}
