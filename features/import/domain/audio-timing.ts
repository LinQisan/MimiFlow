import type { CollectionType, MaterialType } from '@prisma/client'

import { formatMediaTime } from '@/utils/time/format'

export type UploadCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  sortOrder?: number
  collectionType?: CollectionType
  materialType?: MaterialType
  language?: string
  examLevel?: string
  level: { title: string }
}

export type SubtitleLine = {
  id: string
  text: string
  start: number
  end: number
}

export type AudioTimingStatus = {
  type: 'idle' | 'loading' | 'success' | 'error'
  message: string
  lessonId?: string
}

export type WaveformClickMode = 'seek' | 'start' | 'end'

export const formatTimingTime = (seconds: number) =>
  formatMediaTime(seconds, { fractionalDigits: 2 })

export const clampTime = (value: number, duration: number) =>
  Math.max(0, Math.min(duration || value, value))

export const clampViewStart = (
  value: number,
  duration: number,
  windowSeconds: number,
) => Math.max(0, Math.min(Math.max(0, duration - windowSeconds), value))

export function normalizeTimingRange(
  start: number,
  end: number,
  duration: number,
) {
  const safeStart = clampTime(start, duration)
  const safeEnd = clampTime(end, duration)
  return {
    start: Math.min(safeStart, Math.max(0, safeEnd - 0.05)),
    end: Math.max(safeEnd, Math.min(duration, safeStart + 0.05)),
  }
}
