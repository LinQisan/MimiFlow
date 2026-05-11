'use client'

import PaperMaterialTypeBatchForm from './PaperMaterialTypeBatchForm'

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
