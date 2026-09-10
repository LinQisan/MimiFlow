import type { SentenceItem, VocabItem } from '../types'

/** Use real senses even when definitions are empty; every sentence gets a home. */
export function buildVocabularySentenceGroups(vocabulary: Pick<VocabItem, 'senses' | 'meanings' | 'sentences'>) {
  const senses = vocabulary.senses || []
  const groups = senses.length
    ? senses.map(sense => ({
        id: sense.id,
        order: sense.order,
        meaning: sense.definitions.map(definition => definition.text).filter(Boolean).join('；'),
        entries: [] as Array<{ sent: SentenceItem; idx: number }>,
      }))
    : (vocabulary.meanings || []).map((meaning, index) => ({
        id: `legacy-sense-${index}`, order: index, meaning,
        entries: [] as Array<{ sent: SentenceItem; idx: number }>,
      }))
  const unmatchedEntries: Array<{ sent: SentenceItem; idx: number }> = []
  vocabulary.sentences.forEach((sent, idx) => {
    const group = sent.senseId
      ? groups.find(item => item.id === sent.senseId)
      : groups.find(item => item.order === sent.meaningIndex)
    if (group) group.entries.push({ sent, idx })
    else unmatchedEntries.push({ sent, idx })
  })
  return { groups, unmatchedEntries }
}
