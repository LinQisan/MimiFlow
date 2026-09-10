import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSavedJapanesePartsOfSpeech } from '../utils/language/partOfSpeech.ts'
import { formatVocabularySentenceSource } from '../utils/vocabulary/sourceDisplay.ts'

test('normalizes saved Japanese parts of speech before display', () => {
  assert.deepEqual(
    normalizeSavedJapanesePartsOfSpeech(['动词']),
    ['動詞'],
  )
  assert.deepEqual(normalizeSavedJapanesePartsOfSpeech(['形容动词']), ['な形容詞'])
  assert.deepEqual(
    normalizeSavedJapanesePartsOfSpeech(['い形容词', 'な形容詞']),
    ['い形容詞', 'な形容詞'],
  )
})

test('shows the Anki list name instead of classifying it as reading', () => {
  assert.equal(
    formatVocabularySentenceSource({
      source: 'Unit02 动词A',
      sourceUrl: '/manage/import?type=anki',
      sourceType: 'ARTICLE_TEXT',
    }),
    'Unit02 动词A',
  )
  assert.equal(
    formatVocabularySentenceSource({
      source: 'N2語彙トレーニング › Unit02 动词A',
      sourceUrl: '/vocabulary/wordbooks/example-id',
      sourceType: null,
    }),
    'N2語彙トレーニング › Unit02 动词A',
  )
})
