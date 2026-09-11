import type { SentenceItem, VocabItem } from '../types'

export function buildVocabularySentenceGroups(vocabulary: Pick<VocabItem, 'senses' | 'sentences'>) {
  const senses = vocabulary.senses || []
  const groups = senses.map(sense => ({
    id: sense.id,
    order: sense.order,
    meaning: sense.definitions.map(definition => definition.text).filter(Boolean).join('；'),
    entries: [] as Array<{ sent: SentenceItem; idx: number }>,
  }))
  const unmatchedEntries: Array<{ sent: SentenceItem; idx: number }> = []
  vocabulary.sentences.forEach((sent, idx) => {
    const group = groups.find(item => item.id === sent.senseId)
    if (group) group.entries.push({ sent, idx })
    else unmatchedEntries.push({ sent, idx })
  })
  return { groups, unmatchedEntries }
}
