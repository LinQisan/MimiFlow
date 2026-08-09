export type UnknownRecord = Record<string, unknown>

export function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function asBoolean(value: unknown): boolean {
  return value === true
}

export function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
