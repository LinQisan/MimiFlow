import { buildAudioDialogueSourceId } from '../../../../utils/audioDialogue/sourceId.ts'
import { normalizeVocabularySentenceTextKey } from '../../../../utils/vocabulary/sentenceQuality.ts'

export function listeningMaterialId(sourceUrl: string) {
  return sourceUrl.match(/^\/listening\/([^/?#]+)(?:[?#].*)?$/)?.[1] || ''
}

/** Never guess between repeated lines or attach an invalid audio interval. */
export function matchListeningSentenceSource(text: string, materialId: string, dialogues: Array<{
  text: string; stableId: string; start: number; end: number
}>) {
  const key = normalizeVocabularySentenceTextKey(text)
  if (!key) return null
  const matches = dialogues.filter(row => normalizeVocabularySentenceTextKey(row.text) === key)
  if (matches.length !== 1) return null
  const row = matches[0]
  if (!Number.isFinite(row.start) || !Number.isFinite(row.end) || row.start < 0 || row.end <= row.start) return null
  return buildAudioDialogueSourceId(materialId, row.stableId)
}
