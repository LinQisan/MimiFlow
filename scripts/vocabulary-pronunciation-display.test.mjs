import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  getVocabularyDisplayPronunciations,
  splitVocabularyPronunciationAlternatives,
} from '../utils/text/pronunciation.ts'

test('vocabulary display keeps every authored kana reading in order', () => {
  assert.deepEqual(
    getVocabularyDisplayPronunciations('便', ['びん', 'べん']),
    ['びん', 'べん'],
  )
  assert.deepEqual(
    getVocabularyDisplayPronunciations('便', ['びん/べん', 'ビン']),
    ['びん', 'べん'],
  )
})

test('compact readings split safely while preserving manual ruby and IPA', () => {
  assert.deepEqual(splitVocabularyPronunciationAlternatives('びん／べん、ビン'), [
    'びん',
    'べん',
    'ビン',
  ])
  assert.deepEqual(splitVocabularyPronunciationAlternatives('ｶﾐ/ｼﾞﾝ'), [
    'カミ',
    'ジン',
  ])
  assert.deepEqual(splitVocabularyPronunciationAlternatives('せ/よ'), ['せ', 'よ'])
  assert.deepEqual(splitVocabularyPronunciationAlternatives('びん\nべん'), [
    'びん',
    'べん',
  ])
  assert.deepEqual(
    getVocabularyDisplayPronunciations('割と', [
      'わりに / わりと / わりあい(に / と) わりと',
    ]),
    ['わりと'],
  )
  assert.deepEqual(getVocabularyDisplayPronunciations('人間', ['にん|げん']), [
    'にん|げん',
  ])
  assert.deepEqual(
    getVocabularyDisplayPronunciations('word', ['/wɜːd/', '/wɝːd/']),
    ['/wɜːd/', '/wɝːd/'],
  )
})

test('headword display ignores stale materialized segments and match tags omit readings', async () => {
  const [wordComponent, tabs] = await Promise.all([
    readFile(path.join(process.cwd(), 'components/vocabulary/WordPronunciation.tsx'), 'utf8'),
    readFile(path.join(process.cwd(), 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'), 'utf8'),
  ])
  assert.match(wordComponent, /segments\.map\(segment => segment\.text\)\.join\(''\) === word/)
  assert.match(wordComponent, /aria-label='已保存读音'/)
  assert.match(tabs, /getVocabularyDisplayPronunciations/)
  assert.match(tabs, /!authoredPronunciations\.includes\(variant\)/)
  assert.match(tabs, /VocabularyReadingAudioButtons/)
  assert.equal(tabs.includes('speechSynthesis'), false)
})
