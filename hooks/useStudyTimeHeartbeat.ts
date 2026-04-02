'use client'

import { useEffect, useRef } from 'react'
import { StudyTimeKind } from '@prisma/client'
import { logStudyTime } from '@/app/actions/studyTelemetry'

type Options = {
  enabled: boolean
  kind: StudyTimeKind
  intervalMs?: number
}

export default function useStudyTimeHeartbeat({
  enabled,
  kind,
  intervalMs = 45000,
}: Options) {
  const lastActiveAtRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return

    lastActiveAtRef.current = Date.now()

    const flush = () => {
      if (document.hidden) {
        lastActiveAtRef.current = Date.now()
        return
      }
      const now = Date.now()
      const deltaSec = (now - lastActiveAtRef.current) / 1000
      lastActiveAtRef.current = now
      if (deltaSec < 15) return
      void logStudyTime(kind, deltaSec)
    }

    const timer = window.setInterval(flush, intervalMs)

    const onVisibilityChange = () => {
      if (document.hidden) {
        lastActiveAtRef.current = Date.now()
      } else {
        lastActiveAtRef.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush()
    }
  }, [enabled, intervalMs, kind])
}
