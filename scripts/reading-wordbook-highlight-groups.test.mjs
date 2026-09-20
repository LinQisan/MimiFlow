import assert from 'node:assert/strict'
import test from 'node:test'

import {
  groupWordbookDistributionBySource,
  groupWordbookHighlightChoices,
  jlptLevelsIntersect,
  resolveJlptHighlightSlot,
} from '../modules/reading/domain/wordbook-highlight-groups.ts'
import { resolvePrimaryVocabularyJlpt } from '../modules/knowledge/vocabulary/domain/jlpt.ts'


test('article wordbook choices stay flat and do not infer JLPT from labels', () => {
  const groups = groupWordbookHighlightChoices([
    {
      id: 'red-book',
      label: '红宝书',
      wordCount: 22,
    },
    {
      id: 'n1-training',
      label: 'N1語彙トレーニング',
      wordCount: 11,
    },
    {
      id: 'n2-training',
      label: 'N2語彙トレーニング',
      wordCount: 1,
    },
  ])

  assert.deepEqual(
    groups.map(group => ({ id: group.id, label: group.label, wordCount: group.wordCount })),
    [
      { id: 'red-book', label: '红宝书', wordCount: 22 },
      { id: 'n1-training', label: 'N1語彙トレーニング', wordCount: 11 },
      { id: 'n2-training', label: 'N2語彙トレーニング', wordCount: 1 },
    ],
  )
  assert.equal('wordbooks' in groups[0], false)
  assert.equal('level' in groups[1], false)
})

test('distribution rows merge into one source while preserving word metadata', () => {
  const sources = groupWordbookDistributionBySource([
    {
      id: 'red-n4-unit',
      pathLabel: '红宝书 / N4',
      sourceId: 'red-series',
      sourceLabel: '红宝书',
      matchedWords: ['満員', '視線'],
      matchedHeadwords: { 満員: '満員', 視線: '視線' },
      matchedJlpt: { 満員: ['N4'], 視線: ['N1', 'N2'] },
    },
    {
      id: 'red-n2-unit',
      pathLabel: '红宝书 / N2',
      sourceId: 'red-series',
      sourceLabel: '红宝书',
      matchedWords: ['視線'],
      matchedHeadwords: { 視線: '視線' },
      matchedJlpt: { 視線: ['N2'] },
    },
    {
      id: 'n1-unit-01',
      pathLabel: 'N1語彙トレーニング / Unit01',
      sourceId: 'n1-series',
      sourceLabel: 'N1語彙トレーニング',
      matchedWords: ['視線', '映画館'],
      matchedHeadwords: { 視線: '視線', 映画館: '映画館' },
      matchedJlpt: { 視線: ['N1', 'N2'], 映画館: ['N2'] },
    },
  ])

  assert.deepEqual(sources.map(source => [source.id, source.label]), [
    ['red-series', '红宝书'],
    ['n1-series', 'N1語彙トレーニング'],
  ])
  const redSource = sources.find(source => source.id === 'red-series')
  const n1Source = sources.find(source => source.id === 'n1-series')
  assert.ok(redSource)
  assert.ok(n1Source)
  assert.deepEqual(redSource.matchedWords, ['視線', '満員'])
  assert.deepEqual(redSource.jlptByWord['視線'], ['N1', 'N2'])
  assert.deepEqual(redSource.wordbookIdsByWord['視線'], ['red-n4-unit', 'red-n2-unit'])
  assert.deepEqual(n1Source.matchedWords, ['映画館', '視線'])
})

test('JLPT filtering uses intersection semantics and a stable primary color', () => {
  assert.equal(jlptLevelsIntersect(['N1', 'N2'], ['N2']), true)
  assert.equal(jlptLevelsIntersect(['N1', 'N2'], ['N1']), true)
  assert.equal(jlptLevelsIntersect(['N1', 'N2'], ['N3']), false)
  assert.equal(jlptLevelsIntersect(['N1', 'N2'], []), true)
  assert.equal(resolvePrimaryVocabularyJlpt('["N2", "N1"]'), 'N1')

  assert.equal(resolvePrimaryVocabularyJlpt(['N2', 'N1']), 'N1')
  assert.equal(resolvePrimaryVocabularyJlpt(['N2', 'N1', 'N5']), 'N1')
  assert.equal(resolveJlptHighlightSlot(resolvePrimaryVocabularyJlpt(['N2', 'N1'])), 4)
  assert.equal(resolveJlptHighlightSlot(resolvePrimaryVocabularyJlpt(['N4'])), 1)
})
