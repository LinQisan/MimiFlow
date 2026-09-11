type VocabularySenseDefinitions = {
  definitions: ReadonlyArray<{ definition: string }>
}

export function listVocabularyMeanings(
  senses: ReadonlyArray<VocabularySenseDefinitions>,
) {
  return Array.from(
    new Set(
      senses
        .flatMap(sense => sense.definitions)
        .map(definition => definition.definition.trim())
        .filter(Boolean),
    ),
  )
}
