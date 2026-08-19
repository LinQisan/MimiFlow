import type { MaterialType } from '@prisma/client'

import type { PickedFileMeta } from './types'
export { isCollectionTypeAllowedForMaterial } from '../collection-policy.ts'

export const autoIncrementString = (str: string) => {
  if (!str) return ''
  return str.replace(/(\d+)(?!.*\d)/, match => {
    const num = parseInt(match, 10) + 1
    return num.toString().padStart(match.length, '0')
  })
}

export const getStem = (name: string) =>
  name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '')

export const buildPickedKey = (file: PickedFileMeta) => `${file.name}::${file.size}`

export const deriveAudioPathFromDir = (audioPath: string, assName: string) => {
  const trimmed = audioPath.trim()
  if (!trimmed.endsWith('/')) return trimmed
  const baseName = assName.replace(/\.[^.]+$/, '')
  return `${trimmed}${baseName}.mp3`
}

function deriveJlptPaperAudioFolder(title: string, level: string | null) {
  const normalizedTitle = title.normalize('NFKC').trim()
  const normalizedLevel = (
    level ||
    normalizedTitle.match(/\bN[1-5]\b/i)?.[0] ||
    ''
  )
    .trim()
    .toUpperCase()
  if (!/^N[1-5]$/.test(normalizedLevel)) return null

  const japaneseDate = normalizedTitle.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/)
  const separatedDate = normalizedTitle.match(/(20\d{2})[-/.](\d{1,2})(?!\d)/)
  const compactDate = normalizedTitle.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/)
  const match = japaneseDate || separatedDate || compactDate
  if (!match) return null

  const month = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return `listening/jlpt/${normalizedLevel.toLowerCase()}/${match[1]}-${String(month).padStart(2, '0')}`
}

function toAudioStorageSegment(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 72) || 'untitled'
}

export function buildCollectionAudioFolder(input: {
  materialType: MaterialType
  collection: {
    id: string
    title: string
    collectionType: string
    level?: string | null
    parent?: { id: string; title: string } | null
  }
}) {
  const collectionSegment = toAudioStorageSegment(input.collection.title)

  if (input.materialType === 'LISTENING') {
    const jlptFolder =
      input.collection.collectionType === 'PAPER'
        ? deriveJlptPaperAudioFolder(
            input.collection.title,
            input.collection.level || null,
          )
        : null
    if (jlptFolder) return jlptFolder
    const parentSegment = input.collection.parent
      ? `${toAudioStorageSegment(input.collection.parent.title)}/`
      : ''
    return `listening/collections/${parentSegment}${collectionSegment}`
  }

  if (input.materialType === 'SPEAKING') {
    if (input.collection.parent) {
      const parentSegment = toAudioStorageSegment(input.collection.parent.title)
      return `shadowing/${parentSegment}/${collectionSegment}`
    }
    return `shadowing/${collectionSegment}`
  }

  return `staging/${collectionSegment}`
}

export const getDefaultCollectionTypeForMaterial = (materialType: MaterialType) => {
  if (materialType === 'SPEAKING' || materialType === 'MEDIA_SUBTITLE') {
    return 'CUSTOM_GROUP'
  }
  return 'PAPER'
}

function splitAssRow(row: string, splitLimit: number) {
  const parts: string[] = []
  let cursor = 0

  for (let idx = 0; idx < splitLimit - 1; idx += 1) {
    const commaIndex = row.indexOf(',', cursor)
    if (commaIndex === -1) break
    parts.push(row.slice(cursor, commaIndex))
    cursor = commaIndex + 1
  }

  parts.push(row.slice(cursor))
  return parts
}

function cleanAssDialogueText(text: string) {
  return text
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

export function extractAssDialoguePlainText(input: string) {
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  let formatFields: string[] = []
  let textIndex = 9
  const output: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('Format:')) {
      formatFields = line
        .replace('Format:', '')
        .split(',')
        .map(item => item.trim().toLowerCase())
      const nextTextIndex = formatFields.indexOf('text')
      if (nextTextIndex >= 0) textIndex = nextTextIndex
      continue
    }

    if (!line.startsWith('Dialogue:')) continue

    const row = line.replace('Dialogue:', '').trim()
    const splitLimit = formatFields.length > 0 ? formatFields.length : textIndex + 1
    const parts = splitAssRow(row, splitLimit)
    if (parts.length <= textIndex) continue

    output.push(...cleanAssDialogueText(parts[textIndex]))
  }

  return output.join('\n')
}
