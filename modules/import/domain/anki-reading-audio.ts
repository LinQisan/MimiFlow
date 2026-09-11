export type AnkiReadingAudio = { vocabularyId: string; reading: string; audioFile: string }

/** Keep each note's audio bound to its own reading, never merged headword readings. */
export function planAnkiReadingAudio(vocabularyId: string, readings: string[], audioFile: string): AnkiReadingAudio | null {
  const reading = [...new Set(readings.map(value => value.normalize('NFKC').trim()).filter(Boolean))].join(' / ')
  const normalizedAudioFile = audioFile.trim()
  const normalizedVocabularyId = vocabularyId.trim()
  return reading && normalizedAudioFile && normalizedVocabularyId
    ? { vocabularyId: normalizedVocabularyId, reading, audioFile: normalizedAudioFile }
    : null
}

export function changedAnkiFields<
  T extends Record<string, unknown>,
  K extends keyof T,
>(existing: T, incoming: Pick<T, K>): Pick<T, K> {
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) =>
    JSON.stringify(existing[key]) !== JSON.stringify(value),
  )) as Pick<T, K>
}
