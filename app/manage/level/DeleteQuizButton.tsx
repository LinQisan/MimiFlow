'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteQuiz } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

export default function DeleteQuizButton({
  quizId,
  title,
}: {
  quizId: string
  title: string
}) {
  const dialog = useDialog()
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setIsDeleting(true)
    const res = await deleteQuiz(quizId)
    if (res.success) {
      dialog.toast('删除成功', { tone: 'success' })
      router.refresh()
    } else {
      dialog.toast(res.message || '删除失败', { tone: 'error' })
      setIsDeleting(false)
    }
  }

  return (
    <InlineConfirmAction
      message={`确认移除题库《${title}》吗？移除后不可恢复。`}
      onConfirm={handleDelete}
      triggerLabel='移除题库'
      pendingLabel='移除中...'
      confirmLabel='确认移除'
      triggerClassName='whitespace-nowrap border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700 disabled:opacity-50'
    />
  )
}
