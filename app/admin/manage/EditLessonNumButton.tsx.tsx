// app/admin/manage/EditLessonNumButton.tsx
'use client'

import { useTransition } from 'react'
import { updateLessonNum } from './action'

export default function EditLessonNumButton({
  lessonId,
  currentNum,
}: {
  lessonId: string
  currentNum: string
}) {
  const [isPending, startTransition] = useTransition()

  const handleEdit = () => {
    // 弹出输入框，并默认填入当前的编号
    const newNum = prompt(
      '请输入新的题目编号 (例如 1.1 或 Lesson1)：',
      currentNum,
    )

    if (newNum && newNum.trim() !== '' && newNum !== currentNum) {
      startTransition(async () => {
        const res = await updateLessonNum(lessonId, newNum.trim())
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
      className='text-xs text-indigo-400 hover:text-indigo-600 underline decoration-dashed cursor-pointer transition-colors ml-2 font-normal'
      title='修改题目编号'>
      {isPending ? '修改中...' : '✏️改编号'}
    </button>
  )
}
