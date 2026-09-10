import 'server-only'
import type { Prisma } from '@prisma/client'
import { planAnkiMeanings } from '../domain/anki-vocabulary'

/** Append imported definitions without replacing authored senses or their examples. */
export async function ensureAnkiVocabularySenses(userId: string, vocabularyId: string, meanings: string[], incoming: string[] = meanings, usage = '', sourceName: string, tx: Prisma.TransactionClient) {
    const vocabulary = await tx.vocabulary.findFirst({
      where: { id: vocabularyId, userId },
      select: { senses: { orderBy: { order: 'asc' }, select: { id: true, order: true, definitions: { select: { definition: true } } } } },
    })
    if (!vocabulary) throw new Error('单词不存在或无权导入。')
    const senses = vocabulary.senses
    const additions = planAnkiMeanings(senses.flatMap(s => s.definitions.map(d => d.definition)), meanings)
    let nextOrder = (senses.at(-1)?.order ?? -1) + 1
    for (const meaning of additions) {
      const empty = senses.find(s => s.definitions.length === 0)
      const sense = empty || await tx.vocabularySense.create({ data: { vocabularyId, order: nextOrder++ }, select: { id: true, order: true } })
      await tx.vocabularyDefinition.create({ data: { vocabularyId, senseId: sense.id, language: 'zh', dictionaryName: sourceName, definition: meaning, sortOrder: 0 } })
      if (empty) empty.definitions.push({ definition: meaning })
      else senses.push({ ...sense, definitions: [{ definition: meaning }] })
    }
    if (!senses.length) {
      const sense = await tx.vocabularySense.create({ data: { vocabularyId, order: 0 }, select: { id: true, order: true } })
      senses.push({ ...sense, definitions: [] })
    }
    const match = senses.find(s => s.definitions.some(d => incoming.includes(d.definition))) || senses[0]
    if (usage.trim() && !await tx.vocabularyUsageNote.findFirst({ where: { senseId: match.id, type: 'usage', text: usage.trim() }, select: { id: true } })) {
      await tx.vocabularyUsageNote.create({ data: { senseId: match.id, type: 'usage', text: usage.trim(), sortOrder: 0 } })
    }
    return { id: match.id, order: match.order }
}
