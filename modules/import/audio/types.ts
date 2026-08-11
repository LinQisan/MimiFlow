import type { MaterialType } from '@prisma/client'

export type PickedFileMeta = {
  name: string
  size: number
}

export type UploadStatus = {
  type: 'idle' | 'loading' | 'success' | 'error'
  message: string
}

export type LastUploadResult = {
  lessonIds: string[]
  materialType?: MaterialType
  listeningSectionNumber?: number | null
}

export type AudioMatchPreviewRow = PickedFileMeta & {
  key: string
  stem: string
  autoValue: string
  autoLabel: string
  uploadCandidates: string[]
  scopedCandidates: string[]
  siteCandidates: string[]
}

export type DropdownOption = {
  value: string
  label: string
  searchText?: string
  depth?: number
  order?: number
  group?: string
}
