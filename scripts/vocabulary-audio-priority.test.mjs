import assert from 'node:assert/strict'
import test from 'node:test'

import { selectLatestVocabularyWordAudio } from '../utils/vocabulary/audioPriority.ts'
import {
  getVocabularyRecordPriority,
  getVocabularySeriesPriority,
  prefersAuthoredVocabularyPronunciation,
} from '../utils/vocabulary/sourcePriority.ts'
import { mergeVocabularyPronunciations } from '../utils/text/pronunciation.ts'

test('the most recently uploaded vocabulary audio overrides older audio', () => {
  const audio = selectLatestVocabularyWordAudio([
    {
      wordAudio: '/audios/vocabulary/original.mp3',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      wordAudio: '/audios/vocabulary/replacement.mp3',
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-31T00:00:00.000Z',
    },
  ])

  assert.equal(audio, '/audios/vocabulary/replacement.mp3')
})

test('empty newer audio does not hide an existing audio file', () => {
  const audio = selectLatestVocabularyWordAudio([
    {
      wordAudio: '/audios/vocabulary/available.mp3',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      wordAudio: null,
      createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:00:00.000Z',
    },
  ])

  assert.equal(audio, '/audios/vocabulary/available.mp3')
})

test('vocabulary training content at every JLPT level takes priority over Red Book content', () => {
  assert.equal(getVocabularySeriesPriority('N1語彙トレーニング'), 0)
  assert.equal(getVocabularySeriesPriority('N2語彙トレーニング'), 0)
  assert.equal(getVocabularySeriesPriority('N5語彙トレーニング'), 0)
  assert.equal(getVocabularySeriesPriority('红宝书'), 1)
  assert.equal(getVocabularyRecordPriority(['红宝书']), 1)
  assert.equal(
    getVocabularyRecordPriority(['红宝书', 'N2語彙トレーニング']),
    0,
  )
})

test('N2 vocabulary training pronunciation overrides an existing primary reading', () => {
  assert.deepEqual(
    mergeVocabularyPronunciations({
      word: '外',
      existing: ['そと'],
      incoming: ['ほか'],
      preferIncoming: true,
    }),
    ['ほか', 'そと'],
  )
  assert.deepEqual(
    mergeVocabularyPronunciations({
      word: '外',
      existing: ['そと'],
      incoming: ['ほか'],
    }),
    ['そと', 'ほか'],
  )
})

test('vocabulary training uses its authored reading instead of automatic ruby', () => {
  assert.equal(
    prefersAuthoredVocabularyPronunciation([
      '红宝书 › N5',
      'N2語彙トレーニング › Unit04 名词B',
    ]),
    true,
  )
  assert.equal(
    prefersAuthoredVocabularyPronunciation([
      'N1語彙トレーニング › Unit01 名词A',
    ]),
    true,
  )
  assert.equal(
    prefersAuthoredVocabularyPronunciation(['红宝书 › N5']),
    false,
  )
})
