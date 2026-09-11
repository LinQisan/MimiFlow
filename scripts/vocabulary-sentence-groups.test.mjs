import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVocabularySentenceGroups } from '../modules/knowledge/vocabulary/domain/sentence-groups.ts'
import { hydrateVocabularyPayload } from '../modules/knowledge/vocabulary/domain/payload.ts'

const sentence = (id, extra = {}) => ({ id, text: 'ここって前は雑木林だったよな', source: 'Nadeshiko', sourceUrl: `https://nadeshiko.co/sentence/${id}`, ...extra })
const sense = (id, order = 0) => ({ id, order, definitions: [], examples: [], patterns: [], expressions: [], relations: [], notes: [] })

test('saved anime example remains visible through payload hydration with an empty-definition sense', () => {
  const saved = sentence('clip', { senseId: 'sense-a' })
  const [vocabulary] = hydrateVocabularyPayload({ ja: [{ id: 'v', meanings: [], sentencePool: [saved], sentenceIds: ['clip'], senses: [{ ...sense('sense-a'), exampleIds: ['clip'] }], wordbooks: [], wordbookSources: [] }] }, []).ja
  const { groups, unmatchedEntries } = buildVocabularySentenceGroups(vocabulary)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].meaning, '')
  assert.deepEqual(groups[0].entries.map(row => row.sent.id), ['clip'])
  assert.equal(unmatchedEntries.length, 0)
})

test('sense identity supports sparse authored order', () => {
  const rows = [sentence('one', { senseId: 'b' }), sentence('two', { senseId: 'b' })]
  const { groups } = buildVocabularySentenceGroups({ senses: [sense('a', 0), sense('b', 7)], meanings: [], sentences: rows })
  assert.equal(groups[0].entries.length, 0)
  assert.deepEqual(groups[1].entries.map(row => row.sent.id), ['one', 'two'])
})

test('stale references and unassigned examples never disappear', () => {
  const rows = [sentence('one', { senseId: 'deleted' }), sentence('two', { senseId: 'deleted' }), sentence('three')]
  const result = buildVocabularySentenceGroups({ senses: [], sentences: rows })
  assert.deepEqual(result.unmatchedEntries.map(row => row.sent.id), ['one', 'two', 'three'])
})

test('identical dialogue from separate clips is not collapsed by display grouping', () => {
  const rows = [sentence('one', { senseId: 'a' }), sentence('two', { senseId: 'a' })]
  const { groups } = buildVocabularySentenceGroups({ senses: [sense('a')], sentences: rows })
  assert.equal(groups[0].entries.length, 2)
})
