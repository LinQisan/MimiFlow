import assert from 'node:assert/strict'
import test from 'node:test'
import { planAnkiMeanings, preferredAnkiAudio, normalizeAnkiGroupTitle } from '../modules/import/domain/anki-vocabulary.ts'

test('reimport appends only new meanings and preserves authored definitions', () => {
  assert.deepEqual(planAnkiMeanings(['已有释义'], ['已有释义', ' 新释义 ', '新释义', '']), ['新释义'])
  assert.deepEqual(planAnkiMeanings(['已有释义', '新释义'], ['新释义']), [])
})
test('audio imports fill missing audio without replacing personal files', () => {
  assert.equal(preferredAnkiAudio('/audios/personal.mp3', '/audios/import.mp3'), '/audios/personal.mp3')
  assert.equal(preferredAnkiAudio(null, '/audios/import.mp3'), '/audios/import.mp3')
  assert.equal(preferredAnkiAudio('/audios/existing.mp3', null), '/audios/existing.mp3')
})
test('visually identical Japanese groups use the same comparison key', () => {
  assert.equal(normalizeAnkiGroupTitle('N1語彙トレーニング'), normalizeAnkiGroupTitle('N1語彙トレーニング'))
  assert.notEqual(normalizeAnkiGroupTitle('N1語彙トレーニング'), normalizeAnkiGroupTitle('N2語彙トレーニング'))
})
