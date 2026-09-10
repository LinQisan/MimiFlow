import { expandVocabularyHeadwordMatchVariants } from '../../../utils/vocabulary/vocabularyCanonical.ts'

// Loanword adjectives/verbs can retain authored な / る / する endings.
// Keep this narrow rather than treating arbitrary mixed-script text as a loanword.
const KATAKANA_WORD = /^(?=.*[ァ-ヺ])[ァ-ヺー・･\s]+(?:な|る|する)?$/u
const LATIN_WORDS = /^[A-Za-z]+(?:[\s’'&.+/-]+[A-Za-z]+)*$/u

/** Anki loanword decks often put the source spelling in the reading field.
 * Restrict inference to katakana headwords and plain Latin spellings: kana,
 * IPA, labelled romanization and readings of other languages are untouched.
 */
export function splitJapaneseEtymologies(
  word: string,
  readings: readonly string[],
  savedEtymologies: readonly string[] = [],
) {
  const pronunciations: string[] = []
  const etymologies = [...savedEtymologies]
  // Normalize optional grammatical endings before the shared headword splitter
  // trims trailing punctuation. This is classification only, never a word edit.
  const classificationWord = word.normalize('NFKC').replace(/\((な|る|する)\)(?=\s*(?:\/|$))/gu, '$1')
  const variants = expandVocabularyHeadwordMatchVariants(classificationWord)
  const katakana = variants.length > 0 && variants.every(variant => KATAKANA_WORD.test(variant))
  for (const reading of readings) {
    const value = reading.trim()
    if (!value) continue
    if (katakana && LATIN_WORDS.test(value.normalize('NFKC'))) etymologies.push(value)
    else pronunciations.push(value)
  }
  const unique = (values: readonly string[], ignoreCase = false) => {
    const seen = new Set<string>()
    return values.map(value => value.trim()).filter(value => {
      const key = ignoreCase ? value.normalize('NFKC').toLowerCase() : value
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return { pronunciations: unique(pronunciations), etymologies: unique(etymologies, true) }
}
