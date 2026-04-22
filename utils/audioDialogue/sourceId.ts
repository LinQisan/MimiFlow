export const AUDIO_DIALOGUE_SOURCE_SEPARATOR = '::'

export function buildAudioDialogueSourceId(materialId: string, stableId: string) {
  const normalizedMaterialId = (materialId || '').trim()
  const normalizedStableId = (stableId || '').trim()
  if (!normalizedMaterialId || !normalizedStableId) return ''
  return `${normalizedMaterialId}${AUDIO_DIALOGUE_SOURCE_SEPARATOR}${normalizedStableId}`
}

export function buildAudioDialogueSourceIdCandidates(
  materialId: string,
  stableId: string,
  legacyLineId?: number | string | null,
) {
  const candidates = new Set<string>()
  const stableSourceId = buildAudioDialogueSourceId(materialId, stableId)
  if (stableSourceId) candidates.add(stableSourceId)
  const legacyValue = String(legacyLineId ?? '').trim()
  if (legacyValue) candidates.add(legacyValue)
  return Array.from(candidates)
}
