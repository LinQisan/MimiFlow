'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Refresh an already-open vocabulary page after returning from another tab. */
export default function VocabularyRefreshOnReturn() {
  const router = useRouter()

  useEffect(() => {
    let away = document.visibilityState === 'hidden'
    const onLeave = () => { away = true }
    const onReturn = () => {
      if (!away || document.visibilityState !== 'visible') return
      away = false
      router.refresh()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onLeave()
      else onReturn()
    }
    window.addEventListener('blur', onLeave)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  return null
}
