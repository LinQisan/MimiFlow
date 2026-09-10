import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getVocabularyPartOfSpeechParent,
  getVocabularyTagFromPartOfSpeech,
  getVocabularyPartOfSpeechFilterOptions,
  matchesVocabularyPartsOfSpeech,
  normalizeVocabularyPartOfSpeechFilter,
} from '../utils/vocabulary/partOfSpeech.ts'

test('part-of-speech filtering matches an exact authored tag', () => {
  assert.equal(matchesVocabularyPartsOfSpeech(['名词', '名詞'], '名词'), true)
  assert.equal(matchesVocabularyPartsOfSpeech(['名詞'], '名词'), true)
  assert.equal(matchesVocabularyPartsOfSpeech([' 名词 '], '名词'), true)
  assert.equal(matchesVocabularyPartsOfSpeech(['代名詞'], '名词'), false)
  assert.equal(normalizeVocabularyPartOfSpeechFilter('名词'), '名詞')
})

test('all keeps vocabulary without a part-of-speech tag', () => {
  assert.equal(matchesVocabularyPartsOfSpeech([], 'all'), true)
})

test('adjective parent filter includes i-adjectives and na-adjectives', () => {
  assert.equal(matchesVocabularyPartsOfSpeech(['い形容詞'], '形容词'), true)
  assert.equal(matchesVocabularyPartsOfSpeech(['な形容詞'], '形容詞'), true)
  assert.equal(matchesVocabularyPartsOfSpeech(['形容動詞'], '形容詞'), true)
  assert.equal(matchesVocabularyPartsOfSpeech(['形容詞'], 'い形容詞'), false)
  assert.equal(getVocabularyPartOfSpeechParent('い形容词'), '形容詞')
  assert.equal(getVocabularyPartOfSpeechParent('名詞'), null)
})

test('verb parent filter includes compound verbs without losing the subtype', () => {
  assert.equal(matchesVocabularyPartsOfSpeech(['複合動詞'], '动词'), true)
  assert.deepEqual(
    getVocabularyPartOfSpeechFilterOptions([
      'い形容词',
      'な形容詞',
      '复合动词',
    ]),
    ['形容詞', 'い形容詞', 'な形容詞', '動詞', '複合動詞'],
  )
})

test('word-form categories are treated as vocabulary tags', () => {
  assert.equal(getVocabularyTagFromPartOfSpeech('カタカナ'), 'カタカナ語')
  assert.equal(getVocabularyTagFromPartOfSpeech('カタカナ語'), 'カタカナ語')
  assert.equal(getVocabularyTagFromPartOfSpeech('片假名词'), 'カタカナ語')
  assert.equal(getVocabularyTagFromPartOfSpeech('畳語'), '畳語')
  assert.equal(getVocabularyTagFromPartOfSpeech('接尾語'), '接尾語')
  assert.equal(getVocabularyTagFromPartOfSpeech('連語'), '連語')
  assert.equal(getVocabularyTagFromPartOfSpeech('名詞'), null)
})
