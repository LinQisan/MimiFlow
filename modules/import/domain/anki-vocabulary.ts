export function planAnkiMeanings(existing: string[], incoming: string[]) {
  const known = new Set(existing.map(text => text.trim()).filter(Boolean))
  return incoming.flatMap(text => {
    const meaning = text.trim()
    if (!meaning || known.has(meaning)) return []
    known.add(meaning)
    return [meaning]
  })
}

export function preferredAnkiAudio(existing: string | null | undefined, incoming: string | null | undefined) {
  return existing || incoming || null
}

export function normalizeAnkiGroupTitle(value: string) {
  return value.normalize('NFKC').trim()
}
