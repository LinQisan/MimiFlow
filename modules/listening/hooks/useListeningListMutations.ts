'use client'

import { useActionState } from 'react'
import { batchAssignShadowingMaterials } from '@/modules/listening/actions'

const initialState = { success: false, message: '' }

export function useListeningListMutations() {
  const [batchState, batchAction, batching] = useActionState(
    async (_previous: typeof initialState, formData: FormData) =>
      batchAssignShadowingMaterials(formData),
    initialState,
  )

  return {
    batchState,
    batchAction,
    batching,
  }
}
