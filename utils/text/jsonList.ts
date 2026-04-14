export const parseJsonStringList = (raw?: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

export const normalizeStringList = (list: string[]): string[] =>
  Array.from(new Set(list.map(item => item.trim()).filter(Boolean)))

export const toJsonStringList = (list: string[]): string | null => {
  const normalized = normalizeStringList(list)
  return normalized.length ? JSON.stringify(normalized) : null
}
