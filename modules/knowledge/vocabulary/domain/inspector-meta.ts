import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

export type VocabularyInspectorMetaUpdate = {
  word: string
  previousWord?: string
  meta: VocabularyMeta
}

/** An empty old entry masks stale server metadata until the next content refresh. */
export function applyVocabularyInspectorMetaUpdate(
  current: Record<string, VocabularyMeta>,
  update: VocabularyInspectorMetaUpdate,
): Record<string, VocabularyMeta> {
  return {
    ...current,
    ...(update.previousWord && update.previousWord !== update.word
      ? {
          [update.previousWord]: {
            pronunciations: [],
            partsOfSpeech: [],
            meanings: [],
            wordAudio: null,
          },
        }
      : {}),
    [update.word]: update.meta,
  }
}

export function applyVocabularyInspectorPronunciationUpdate(
  current: Record<string, string>,
  update: VocabularyInspectorMetaUpdate,
): Record<string, string> {
  const next = { ...current }
  if (update.previousWord && update.previousWord !== update.word) {
    delete next[update.previousWord]
  }
  const reading = update.meta.pronunciations[0]
  if (reading) next[update.word] = reading
  else delete next[update.word]
  return next
}
