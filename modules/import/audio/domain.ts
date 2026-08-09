import type { MaterialType } from '@prisma/client'

import type { PickedFileMeta } from './types'
export { isCollectionTypeAllowedForMaterial } from '../collection-policy'

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

export const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  LISTENING: '聴解 / 听力语料',
  MEDIA_SUBTITLE: '影视字幕',
  READING: '読解 / 阅读材料',
  VOCAB_GRAMMAR: '文字・語彙・文法',
  SPEAKING: '跟读材料',
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
