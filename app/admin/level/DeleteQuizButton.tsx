'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteQuiz } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

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
    const shouldDelete = await dialog.confirm(
      `确定要删除题库《${title}》吗？\n删除后题目会一并删除，且不可恢复。`,
      { title: '删除题库', danger: true, confirmText: '删除' },
    )
    if (!shouldDelete)
      return
    setIsDeleting(true)
    const res = await deleteQuiz(quizId)
    if (res.success) {
      router.refresh()
    } else {
      await dialog.alert(res.message)
      setIsDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className='text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap disabled:opacity-50'>
      {isDeleting ? '删除中...' : '🗑️ 删除'}
    </button>
  )
}
