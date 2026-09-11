'use client'

import { useRouter } from 'next/navigation'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import { deleteEpubAction } from '@/modules/reading/ebook-actions'

export default function DeleteEbookButton({
  id,
  title,
}: {
  id: string
  title: string
}) {
  const router = useRouter()

  return (
    <InlineConfirmAction
      triggerLabel='删除'
      pendingLabel='删除中...'
      confirmLabel='删除'
      cancelLabel='取消'
      message={`确定删除《${title}》吗？已保存的划词生词不会被删除。`}
      triggerClassName='h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-600 transition hover:bg-rose-50'
      onConfirm={async () => {
        await deleteEpubAction(id)
        router.refresh()
      }}
    />
  )
}
