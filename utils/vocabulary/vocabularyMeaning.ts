export const hasVocabularyMeaning = (meta: { meanings: string[] }) =>
  meta.meanings.some(meaning => meaning.trim().length > 0)
