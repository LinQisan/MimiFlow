'use client'

import {
  deleteMediaSubtitleLine,
  updateMediaSubtitleLineMeta,
} from '@/features/subtitles/actions'

export function useMediaSubtitleMutations() {
  return { deleteMediaSubtitleLine, updateMediaSubtitleLineMeta }
}
