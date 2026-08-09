'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useDialog } from '@/context/DialogContext'
import { deleteAudioMaterial } from '@/features/listening/manage-actions'

export default function DeleteAudioMaterialButton({
  id,
  title,
  materialType,
  questionCount,
  collectionLabel,
  isExamMaterial = false,
  redirectAfterDelete = false,
  redirectHref = '/manage/listening',
}: {
  id: string
  title: string
  materialType: 'LISTENING' | 'SPEAKING'
  questionCount: number
  collectionLabel?: string
  isExamMaterial?: boolean
  redirectAfterDelete?: boolean
  redirectHref?: string
}) {
  const router = useRouter()
  const dialog = useDialog()
  const [pending, startTransition] = useTransition()
  const typeLabel = materialType === 'LISTENING' ? '听力' : '跟读'

  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => {
        const questionText =
          questionCount > 0 ? `及其 ${questionCount} 道题目` : ''
        const relationText = isExamMaterial
          ? `并从试卷“${collectionLabel || '当前试卷'}”中移除`
          : '并移除它的归类关系'
        void dialog
          .confirm(
            `确认删除${typeLabel}材料“${title}”${questionText}，${relationText}？public 中的音频文件会保留。`,
            {
              title: `删除${typeLabel}材料`,
              confirmText: '删除材料',
              danger: true,
            },
          )
          .then(confirmed => {
            if (!confirmed) return
            startTransition(() => {
              const formData = new FormData()
              formData.set('id', id)
              void deleteAudioMaterial(formData).then(result => {
                dialog.toast(result.message || '操作完成。', {
                  tone: result.success ? 'success' : 'error',
                })
                if (!result.success) return
                if (redirectAfterDelete) {
                  router.push(redirectHref)
                } else {
                  router.refresh()
                }
              })
            })
          })
      }}
      className='ui-btn ui-btn-sm border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50'>
      {pending ? '删除中…' : '删除'}
    </button>
  )
}
