import type { Prisma } from '@prisma/client'

type MeaningUpdate = {
  vocabularyId: string
  meanings: string[]
}

export async function replaceVocabularyMeaningDefinitions(
  tx: Prisma.TransactionClient,
  updates: MeaningUpdate[],
  dictionaryName: string,
) {
  if (updates.length === 0) return
  const vocabularyIds = updates.map(update => update.vocabularyId)
  const senses = await tx.vocabularySense.findMany({
    where: { vocabularyId: { in: vocabularyIds } },
    orderBy: [{ vocabularyId: 'asc' }, { order: 'asc' }],
    select: {
      id: true,
      vocabularyId: true,
      order: true,
      definitions: {
        where: { language: { startsWith: 'zh', mode: 'insensitive' } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      },
    },
  })
  const sensesByVocabulary = new Map<string, typeof senses>()
  for (const sense of senses) {
    const rows = sensesByVocabulary.get(sense.vocabularyId) || []
    rows.push(sense)
    sensesByVocabulary.set(sense.vocabularyId, rows)
  }

  for (const update of updates) {
    const meanings = Array.from(
      new Set(update.meanings.map(meaning => meaning.trim()).filter(Boolean)),
    )
    const vocabularySenses = sensesByVocabulary.get(update.vocabularyId) || []
    for (const [order, meaning] of meanings.entries()) {
      let sense = vocabularySenses[order]
      if (!sense) {
        const created = await tx.vocabularySense.create({
          data: { vocabularyId: update.vocabularyId, order },
          select: { id: true, vocabularyId: true, order: true },
        })
        sense = { ...created, definitions: [] }
        vocabularySenses.push(sense)
      }
      const [definition, ...duplicates] = sense.definitions
      if (definition) {
        await tx.vocabularyDefinition.update({
          where: { id: definition.id },
          data: { definition: meaning, dictionaryName, sortOrder: 0 },
        })
      } else {
        await tx.vocabularyDefinition.create({
          data: {
            vocabularyId: update.vocabularyId,
            senseId: sense.id,
            language: 'zh',
            dictionaryName,
            definition: meaning,
            sortOrder: 0,
          },
        })
      }
      if (duplicates.length) {
        await tx.vocabularyDefinition.deleteMany({
          where: { id: { in: duplicates.map(item => item.id) } },
        })
      }
    }

    const trailingDefinitionIds = vocabularySenses
      .slice(meanings.length)
      .flatMap(sense => sense.definitions.map(definition => definition.id))
    if (trailingDefinitionIds.length) {
      await tx.vocabularyDefinition.deleteMany({
        where: { id: { in: trailingDefinitionIds } },
      })
    }
  }
}
