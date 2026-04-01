// app/admin/manage/EditLevelIdButton.tsx
'use client'

import { useTransition } from 'react'
import { updateLevelId } from './action'
import { useDialog } from '@/context/DialogContext'

export default function EditLevelIdButton({ levelId }: { levelId: string }) {
  const dialog = useDialog()
  const [isPending, startTransition] = useTransition()

  const handleEdit = async () => {
    const newId = await dialog.prompt(
      '请输入新的大模块 ID（建议使用小写英文和下划线，例如 en_nce_1）：',
      { title: '修改模块 ID', defaultValue: levelId },
    )

    if (newId && newId.trim() !== '' && newId !== levelId) {
      startTransition(async () => {
        const res = await updateLevelId(levelId, newId.trim())
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
      className='text-sm text-indigo-500 hover:text-indigo-700 ml-3 underline decoration-dashed cursor-pointer transition-colors font-normal'
      title='修改大模块 ID'>
      {isPending ? '修改中...' : '✏️改ID'}
    </button>
  )
}
