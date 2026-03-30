// app/admin/manage/EditCategoryIdButton.tsx
'use client'

import { useTransition } from 'react'
import { updateCategoryId } from './action'

export default function EditCategoryIdButton({
  categoryId,
}: {
  categoryId: string
}) {
  const [isPending, startTransition] = useTransition()

  const handleEdit = () => {
    // 弹出输入框让用户输入新 ID
    const newId = prompt(
      '请输入新的试卷 ID（建议使用英文、数字或下划线）：',
      categoryId,
    )

    if (newId && newId.trim() !== '' && newId !== categoryId) {
      startTransition(async () => {
        const res = await updateCategoryId(categoryId, newId.trim())
        if (!res.success) {
          alert(res.message)
        }
      })
    }
  }

  return (
    <button
      onClick={handleEdit}
      disabled={isPending}
      className='text-xs text-indigo-500 hover:text-indigo-700 ml-2 underline decoration-dashed cursor-pointer transition-colors'
      title='修改试卷 ID'>
      {isPending ? '修改中...' : '✏️改ID'}
    </button>
  )
}
