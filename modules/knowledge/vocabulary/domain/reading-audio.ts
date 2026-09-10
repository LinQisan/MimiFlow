import { splitJapaneseEtymologies } from '../../../language/domain/etymology.ts'

export type VocabularyReadingAudio = {
  reading: string
  audioFile: string
}

/**
 * Keep imported reading recordings in their first authored order while
 * removing duplicate pairs that can come from grouped vocabulary rows.
 */
export function dedupeVocabularyReadingAudios(
  audios: readonly VocabularyReadingAudio[],
  word?: string,
): VocabularyReadingAudio[] {
  const seen = new Set<string>()
  const result: VocabularyReadingAudio[] = []

  for (const audio of audios) {
    const savedReading = audio.reading.normalize('NFKC').trim()
    const reading = word && splitJapaneseEtymologies(word, [savedReading]).etymologies.length
      ? word
      : savedReading
    const audioFile = audio.audioFile.trim()
    if (!reading || !audioFile) continue

    const key = `${reading}\u0000${audioFile}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ reading, audioFile })
  }

  return result
}
