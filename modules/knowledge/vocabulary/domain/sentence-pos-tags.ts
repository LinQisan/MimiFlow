/**
 * Keep sentence-level part-of-speech metadata stable across imports, edits,
 * and page payloads.
 */
export const normalizeVocabularySentencePosTags = (
  values?: readonly string[] | null,
) =>
  Array.from(
    new Set((values || []).map(value => value.trim()).filter(Boolean)),
  ).slice(0, 20)
