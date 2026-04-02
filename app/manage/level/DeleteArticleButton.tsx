'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteArticle } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

export default function DeleteArticleButton({
  articleId,
  title,
}: {
  articleId: string
  title: string
}) {
  const dialog = useDialog()
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await deleteArticle(articleId)
      if (res.success) {
        dialog.toast('删除成功', { tone: 'success' })
        router.refresh()
      } else {
        dialog.toast(res.message || '删除失败，请检查是否有关联数据', {
          tone: 'error',
        })
        setIsDeleting(false)
      }
    } catch (error) {
      dialog.toast('网络或服务器错误，删除失败', { tone: 'error' })
      setIsDeleting(false)
    }
  }

  return (
    <InlineConfirmAction
      message={`确认移除文章《${title}》吗？移除后不可恢复。`}
      onConfirm={handleConfirmDelete}
      triggerLabel='移除文章'
      pendingLabel='移除中...'
      confirmLabel='确认移除'
      triggerClassName='whitespace-nowrap border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700 disabled:opacity-50'
    />
  )
}
