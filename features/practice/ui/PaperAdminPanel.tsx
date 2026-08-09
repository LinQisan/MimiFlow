'use client'

// Practice administration panel.

import PaperMaterialTypeBatchForm from '@/features/practice/ui/PaperMaterialTypeBatchForm'

type Props = {
  paperId: string
}

export default function PaperAdminPanel({ paperId }: Props) {
  return (
    <div className='mt-3'>
      <PaperMaterialTypeBatchForm paperId={paperId} />
    </div>
  )
}
