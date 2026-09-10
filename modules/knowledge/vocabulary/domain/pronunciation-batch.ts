/** Remap only IDs resolved through the current user's vocabulary links. */
export function mapSentencePronunciationResults<T>(
  requestedIds: string[],
  links: Array<{ id: string; sentenceId: string }>,
  data: Record<string, T>,
): Record<string, T> {
  const sentenceById = new Map<string, string>()
  for (const link of links) {
    sentenceById.set(link.id, link.sentenceId)
    sentenceById.set(link.sentenceId, link.sentenceId)
  }
  const mapped: Record<string, T> = {}
  for (const id of requestedIds) {
    const sentenceId = sentenceById.get(id)
    if (sentenceId && data[sentenceId]) mapped[id] = data[sentenceId]
  }
  return mapped
}
