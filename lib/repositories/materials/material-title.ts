import { MaterialType } from '#prisma-client'
import { readString } from '../../validation/schema.ts'
import { decodeMaterialPayloadRecord } from '../../codecs/material-payload.ts'

function extractTextTitle(type: MaterialType, payload: unknown) {
  const record = decodeMaterialPayloadRecord(type, payload)
  const text = readString(record.text) || readString(record.transcript)
  if (!text) return ''

  const firstLine = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)

  if (!firstLine) return ''
  return firstLine.slice(0, 80)
}

export function getMaterialDisplayTitle(
  type: MaterialType,
  rawTitle: string | null | undefined,
  payload: unknown,
  fallbackId?: string | null,
) {
  const title = (rawTitle || '').trim()
  if (title) return title

  if (type === MaterialType.READING) {
    return extractTextTitle(type, payload) || fallbackId || '未命名阅读'
  }
  if (type === MaterialType.LISTENING) {
    return fallbackId || '未命名听力'
  }
  if (type === MaterialType.MEDIA_SUBTITLE) {
    return fallbackId || '未命名影视字幕'
  }
  return fallbackId || '未命名题库'
}

export function getReadingCardTitle(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 36) return normalized

  const opening = normalized.slice(0, 36)
  const sentenceEnd = opening.search(/[。！？!?]/)
  if (sentenceEnd >= 10) return opening.slice(0, sentenceEnd + 1)
  return `${opening.slice(0, 32).trim()}…`
}

const normalizeComparableText = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, '').trim()

export function isReadingTitleDerivedFromContent(
  title: string,
  content: string,
): boolean {
  const normalizedTitle = normalizeComparableText(title).replace(/[…]+$/, '')
  const normalizedContent = normalizeComparableText(content)
  return normalizedTitle.length >= 8 && normalizedContent.startsWith(normalizedTitle)
}
