/**
 * Canonical grouping key for vocabulary headwords.
 *
 * Keep this in JavaScript so writes, imports, and query parameters use the
 * exact same Unicode semantics. PostgreSQL reads the materialized value and
 * never has to normalize every vocabulary row on the cold path.
 */
export const normalizeVocabularyWord = (word: string) =>
  word.normalize('NFKC').trim().toLocaleLowerCase('ja')
