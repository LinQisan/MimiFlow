import { MaterialType } from '@prisma/client'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractTextTitle(payload: unknown) {
  const record = asRecord(payload)
  const text = asString(record.text) || asString(record.transcript)
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
    return extractTextTitle(payload) || fallbackId || '未命名阅读'
  }
  if (type === MaterialType.LISTENING) {
    return fallbackId || '未命名听力'
  }
  return fallbackId || '未命名题库'
}
