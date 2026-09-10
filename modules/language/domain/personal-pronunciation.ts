import { buildPronunciationMapForText } from '../../../utils/vocabulary/japaneseInflection.ts'
import { extractVocabularyPronunciationVariants } from '../../../utils/text/pronunciation.ts'

export type PronunciationChoice = {
  location: string
  sourceText: string
  start: number
  surface: string
  reading: string
}

export const personalReadingCandidates = (surface: string, metadata: Record<string, { pronunciations: string[] }>) => {
  const readings: string[] = []
  for (const [word, meta] of Object.entries(metadata)) {
    for (const raw of meta.pronunciations) {
      const candidates = /[/／]/u.test(raw)
        ? extractVocabularyPronunciationVariants(raw)
        : [raw]
      for (const reading of candidates) {
        const resolved = buildPronunciationMapForText(surface, { [word]: reading })[surface]
        if (resolved && !readings.includes(resolved)) readings.push(resolved)
      }
    }
  }
  return readings
}

export const occurrenceReadings = (text: string, location: string, choices: PronunciationChoice[]) =>
  Object.fromEntries(choices.filter(choice =>
    choice.location === location && choice.sourceText === text &&
    text.slice(choice.start, choice.start + choice.surface.length) === choice.surface,
  ).map(choice => [choice.start, choice.reading]))
