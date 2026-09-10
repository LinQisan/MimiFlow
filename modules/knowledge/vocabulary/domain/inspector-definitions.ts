export type InspectorDefinition = {
  id?: string
  language: string
  dictionaryName: string
  definition: string
}

/** Keep every language and persisted identity; canonical sense links are resolved
 * from owned database rows, never from client-provided associations. */
export function normalizeInspectorDefinitions(definitions: InspectorDefinition[]) {
  return definitions.flatMap(item => {
    const definition = item.definition.trim()
    if (!definition) return []
    return [{
      ...(item.id ? { id: item.id } : {}),
      language: item.language.trim() || 'zh',
      dictionaryName: item.dictionaryName.replace(/\s+/g, ' ').trim(),
      definition,
    }]
  })
}

export function isMigratedChineseDefinition(definition: InspectorDefinition) {
  return definition.dictionaryName.trim() === '旧数据迁移' && /^zh(?:-|$)/i.test(definition.language)
}

export function resolveInspectorMeaningDisplay<T extends InspectorDefinition>(
  meanings: string[],
  definitions: T[],
) {
  const primaryMeanings = [...new Set(meanings.map(text => text.trim()).filter(Boolean))]
  if (!primaryMeanings.length) {
    for (const definition of definitions) {
      const text = definition.definition.trim()
      if (isMigratedChineseDefinition(definition) && text && !primaryMeanings.includes(text)) {
        primaryMeanings.push(text)
      }
    }
  }
  return {
    meanings: primaryMeanings,
    definitions: definitions.filter(definition =>
      definition.definition.trim() &&
      !(isMigratedChineseDefinition(definition) && primaryMeanings.includes(definition.definition.trim())),
    ),
  }
}
