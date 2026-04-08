'use client'

import { useCallback, useMemo, useState } from 'react'

type UseEditModeOptions = {
  defaultValue?: boolean
}

export default function useEditMode(options?: UseEditModeOptions) {
  const [isEditMode, setIsEditMode] = useState(options?.defaultValue ?? false)

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev)
  }, [])

  return useMemo(
    () => ({
      isEditMode,
      setIsEditMode,
      toggleEditMode,
    }),
    [isEditMode, toggleEditMode],
  )
}
