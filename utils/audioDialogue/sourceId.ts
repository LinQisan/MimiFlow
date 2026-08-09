export const AUDIO_DIALOGUE_SOURCE_SEPARATOR = '::'

export function buildAudioDialogueSourceId(materialId: string, stableId: string) {
  const normalizedMaterialId = (materialId || '').trim()
  const normalizedStableId = (stableId || '').trim()
  if (!normalizedMaterialId || !normalizedStableId) return ''
  return `${normalizedMaterialId}${AUDIO_DIALOGUE_SOURCE_SEPARATOR}${normalizedStableId}`
}

export function parseAudioDialogueSourceId(sourceId: string) {
  const normalized = (sourceId || '').trim()
  const separatorIndex = normalized.indexOf(AUDIO_DIALOGUE_SOURCE_SEPARATOR)
  if (separatorIndex <= 0) return null
  const materialId = normalized.slice(0, separatorIndex).trim()
  const stableId = normalized
    .slice(separatorIndex + AUDIO_DIALOGUE_SOURCE_SEPARATOR.length)
    .trim()
  if (!materialId || !stableId) return null
  return { materialId, stableId }
}
