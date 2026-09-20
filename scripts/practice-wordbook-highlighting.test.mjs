import assert from 'node:assert/strict'
import test from 'node:test'

import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  escapeHtml,
} from '../utils/language/japaneseRuby.ts'
import {
  groupWordbookDistributionBySource,
  isJlptVisibleWithHiddenLevels,
} from '../modules/reading/domain/wordbook-highlight-groups.ts'
import { JLPT_LEVELS } from '../modules/knowledge/vocabulary/domain/jlpt.ts'
import { buildSurfaceAliasMapForText } from '../utils/vocabulary/japaneseInflection.ts'


test('annotateJapaneseText wraps tokenWords with vocab-token data attributes for practice player and review', () => {
  const text = 'この問題の核心を突く発言だった。'
  const tokenWords = ['問題', '核心', '突く']
  const pronunciationMap = {
    問題: 'もんだい',
    核心: 'かくしん',
    突く: 'つく',
  }

  // Case 1: rubyEnabled: true, tokenWords active
  const withRuby = annotateJapaneseText(text, pronunciationMap, {
    rubyEnabled: true,
    rubyClassName: 'text-slate-900',
    rtClassName: 'text-slate-500',
    tokenClassName: 'vocab-token',
    tokenWords,
  })
  assert.match(
    withRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="問題"/,
  )
  assert.match(
    withRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="核心"/,
  )
  assert.match(
    withRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="突く"/,
  )
  assert.match(withRuby, /<ruby[^>]*>問<rt/)

  // Case 2: rubyEnabled: false, tokenWords active (no ruby, but vocab tokens present)
  const noRuby = annotateJapaneseText(text, pronunciationMap, {
    rubyEnabled: false,
    rubyClassName: 'text-slate-900',
    rtClassName: 'text-slate-500',
    tokenClassName: 'vocab-token',
    tokenWords,
  })
  assert.match(
    noRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="問題"[^>]*>問題<\/span>/,
  )
  assert.match(
    noRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="核心"[^>]*>核心<\/span>/,
  )
  assert.doesNotMatch(noRuby, /<ruby>/)

  // Case 3: rubyEnabled: false, tokenWords undefined (注释 toggled off)
  const plain = annotateJapaneseText(text, pronunciationMap, {
    rubyEnabled: false,
    tokenClassName: undefined,
  })
  assert.equal(plain, escapeHtml(text))
  assert.doesNotMatch(plain, /data-vocab-token/)
})
test('annotateJapaneseTextWithSudachi wraps tokenWords even when lexicon has no lexemes for the chunk', () => {
  const text = 'この問題の核心を突く発言だった。'
  const tokenWords = ['問題', '核心', '突く']

  // Case 1: Empty lexicon, but tokenWords provided. Must NOT drop tokens!
  const emptyLexiconResult = annotateJapaneseTextWithSudachi(text, {}, {
    tokenWords,
    rubyEnabled: false,
  })
  assert.match(
    emptyLexiconResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="問題"[^>]*>問題<\/span>/,
  )
  assert.match(
    emptyLexiconResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="核心"[^>]*>核心<\/span>/,
  )
  assert.match(
    emptyLexiconResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="突く"[^>]*>突く<\/span>/,
  )

  // Case 2: Lexicon present with matching lexemes and ruby enabled
  const lexicon = {
    問題: { surface: '問題', reading: 'もんだい', dictionaryForm: '問題' },
    核心: { surface: '核心', reading: 'かくしん', dictionaryForm: '核心' },
  }
  const withSudachiRuby = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: true,
    tokenWords,
  })
  assert.match(
    withSudachiRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="問題"[^>]*><ruby[^>]*>問題<rt[^>]*>もんだい<\/rt><\/ruby><\/span>/,
  )
  assert.match(
    withSudachiRuby,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="突く"[^>]*>突く<\/span>/,
  )
})

test('personal and disabled ruby retain vocabulary token boundaries with a Sudachi lexicon', () => {
  // Behavioral execution test: personal pronunciation mode with Sudachi lexicon available
  const text = 'この問題の核心を突く発言だった。'
  const lexicon = {
    問題: { surface: '問題', reading: 'もんだい', dictionaryForm: '問題' },
    核心: { surface: '核心', reading: 'かくしん', dictionaryForm: '核心' },
    突く: { surface: '突く', reading: 'つく', dictionaryForm: '突く' },
  }
  const personalResult = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: false,
    rubyEnabled: true,
    pronunciationMap: { 問題: 'もんだい' },
    tokenClassName: 'vocab-token',
    tokenWords: ['問題', '核心', '突く'],
  })
  // Uses personal ruby for 問題, leaves 核心 without ruby, and wraps all 3 in vocab-token
  assert.match(
    personalResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="問題"[^>]*><ruby[^>]*>問<rt[^>]*>もん<\/rt><\/ruby><ruby[^>]*>題<rt[^>]*>だい<\/rt><\/ruby><\/span>/,
  )
  assert.match(
    personalResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="核心"[^>]*>核心<\/span>/,
  )
  assert.match(
    personalResult,
    /class="vocab-token" data-vocab-token="true" data-vocab-surface="突く"[^>]*>突く<\/span>/,
  )

  // Behavioral execution test: rubyEnabled: false, tokenWords active
  const noRubyResult = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: false,
    tokenClassName: 'vocab-token',
    tokenWords: ['問題', '核心'],
  })
  assert.doesNotMatch(noRubyResult, /<ruby/)
  assert.match(noRubyResult, /data-vocab-surface="問題"[^>]*>問題<\/span>/)
  assert.match(noRubyResult, /data-vocab-surface="核心"[^>]*>核心<\/span>/)
})

test('practice wordbook distribution groups by source and supports JLPT level filtering and canonicalWords deduplication', () => {
  const wordbooks = [
    {
      id: 'red-book-1',
      sourceId: 'red-book',
      sourceLabel: '红宝书',
      pathLabel: '红宝书/Unit01',
      matchedWords: ['問題', '核心', '突く'],
      matchedHeadwords: { 問題: '問題', 核心: '核心', 突く: '突く' },
      matchedJlpt: { 問題: ['N2'], 核心: ['N1'], 突く: ['N1'] },
    },
    {
      id: 'blue-book-1',
      sourceId: 'blue-book',
      sourceLabel: '蓝宝书',
      pathLabel: '蓝宝书/Unit01',
      matchedWords: ['突く'],
      matchedHeadwords: { 突く: '突く' },
      matchedJlpt: { 突く: ['N1'] },
    },
  ]

  const sources = groupWordbookDistributionBySource(wordbooks)
  assert.equal(sources.length, 2)
  assert.equal(sources[0].label, '红宝书')
  assert.deepEqual(sources[0].wordbookIds, ['red-book-1'])

  // Check JLPT filtering
  const hiddenN1 = new Set(['N1'])
  assert.equal(isJlptVisibleWithHiddenLevels(['N1'], hiddenN1), false)
  assert.equal(isJlptVisibleWithHiddenLevels(['N2'], hiddenN1), true)

  const hiddenN2 = new Set(['N2'])
  assert.equal(isJlptVisibleWithHiddenLevels(['N1'], hiddenN2), true)
  assert.equal(isJlptVisibleWithHiddenLevels(['N2'], hiddenN2), false)

  const hiddenAll = new Set(JLPT_LEVELS)
  assert.equal(isJlptVisibleWithHiddenLevels(['N1'], hiddenAll), false)
  assert.equal(isJlptVisibleWithHiddenLevels(['N2'], hiddenAll), false)

  // Check that current text canonicalWords deduplicates inflections to base headwords
  const currentText = '突いた発言と、核心に突いて迫る問題。'
  const matchedHeadwords = Array.from(new Set(Object.values(sources[0].matchedHeadwords)))
  const aliases = buildSurfaceAliasMapForText(currentText, matchedHeadwords)
  const canonicalWords = Array.from(new Set(Object.values(aliases)))
  // '突いた' and '突いて' both map to '突く'
  assert.ok(canonicalWords.includes('突く'))
  assert.ok(canonicalWords.includes('核心'))
  assert.ok(canonicalWords.includes('問題'))
  assert.equal(canonicalWords.length, 3)
})

test('headword JLPT metadata is mapped for inflected forms and selector filters apply consistently', () => {
  const sources = [
    {
      id: 'red-book',
      label: '红宝书',
      matchedWords: ['突いた'],
      matchedHeadwords: { 突いた: '突く' },
      jlptByWord: { 突いた: ['N1'] },
      wordbookIdsByWord: { 突いた: ['wb-1'] },
      wordbookIds: ['wb-1'],
    },
  ]
  const currentText = 'この核心を突いた発言だった。'
  const matchedHeadwords = Array.from(new Set(Object.values(sources[0].matchedHeadwords)))
  const aliases = buildSurfaceAliasMapForText(currentText, matchedHeadwords)
  assert.equal(aliases['突いた'], '突く')

  // Simulate PracticePlayer highlight group building
  const metadataByHeadword = new Map()
  sources[0].matchedWords.forEach(word => {
    const headword = sources[0].matchedHeadwords[word] || word
    const metadata = metadataByHeadword.get(headword) || {
      jlpt: new Set(),
      wordbookIds: new Set(),
    }
    ;(sources[0].jlptByWord[word] || []).forEach(l => metadata.jlpt.add(l))
    ;(sources[0].wordbookIdsByWord[word] || []).forEach(id => metadata.wordbookIds.add(id))
    metadataByHeadword.set(headword, metadata)
  })

  const jlptByWord = {}
  const wordbookIdsByWord = {}
  sources[0].matchedWords.forEach(word => {
    jlptByWord[word] = [...(sources[0].jlptByWord[word] || [])]
    wordbookIdsByWord[word] = sources[0].wordbookIdsByWord[word] || []
  })
  metadataByHeadword.forEach((metadata, headword) => {
    jlptByWord[headword] = [...metadata.jlpt]
    wordbookIdsByWord[headword] = [...metadata.wordbookIds]
  })
  Object.entries(aliases).forEach(([surface, headword]) => {
    const metadata = metadataByHeadword.get(headword)
    jlptByWord[surface] = metadata ? [...metadata.jlpt] : []
    wordbookIdsByWord[surface] = metadata ? [...metadata.wordbookIds] : sources[0].wordbookIds
  })

  // Verify BOTH the surface '突いた' and canonical headword '突く' have N1 JLPT levels
  assert.deepEqual(jlptByWord['突いた'], ['N1'])
  assert.deepEqual(jlptByWord['突く'], ['N1'])
  assert.deepEqual(wordbookIdsByWord['突く'], ['wb-1'])

  // Verify JLPT level filter toggles
  const canonicalWords = Array.from(new Set(Object.values(aliases)))
  const visibleWithN1 = canonicalWords.filter(word =>
    isJlptVisibleWithHiddenLevels(jlptByWord[word] || [], new Set()),
  )
  assert.deepEqual(visibleWithN1, ['突く'])

  const hiddenN1 = new Set(['N1'])
  const visibleWithoutN1 = canonicalWords.filter(word =>
    isJlptVisibleWithHiddenLevels(jlptByWord[word] || [], hiddenN1),
  )
  assert.deepEqual(visibleWithoutN1, [])

  // Verify "全部隐藏" (all JLPT hidden)
  const hiddenAll = new Set(JLPT_LEVELS)
  const visibleWithoutAll = canonicalWords.filter(word =>
    isJlptVisibleWithHiddenLevels(jlptByWord[word] || [], hiddenAll),
  )
  assert.deepEqual(visibleWithoutAll, [])
})
