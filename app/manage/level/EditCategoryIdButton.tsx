// app/admin/manage/EditCategoryIdButton.tsx
'use client'

import { useTransition } from 'react'
import { updateCategoryId } from './action'
import { useDialog } from '@/context/DialogContext'

export default function EditCategoryIdButton({
  categoryId,
}: {
  categoryId: string
}) {
  const dialog = useDialog()
  const [isPending, startTransition] = useTransition()

  const handleEdit = async () => {
    // 弹出输入框让用户输入新 ID
    const newId = await dialog.prompt(
      '请输入新的试卷 ID（建议使用英文、数字或下划线）：',
      { title: '修改试卷 ID', defaultValue: categoryId },
    )

    if (newId && newId.trim() !== '' && newId !== categoryId) {
      startTransition(async () => {
        const res = await updateCategoryId(categoryId, newId.trim())
        if (!res.success) {
          await dialog.alert(res.message)
        }
      })
    }
  }

  return (
    <button
      onClick={handleEdit}
      disabled={isPending}
      className='ml-1 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-700 disabled:opacity-50'
      title='修改试卷 ID'>
      {isPending ? '修改中...' : '修改 ID'}
    </button>
  )
}
