import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  applyPracticeVocabularyKnowledge,
  buildPracticeVocabularyWordbookOptions,
  buildPracticeVocabularyAnalytics,
  buildPracticeVocabularyAnalyticsSummary,
  rankPracticeVocabularyTrendWords,
} from '../modules/practice/domain/vocabulary-analytics.ts'
import { isSudachiContentWord } from '../modules/language/domain/sudachi.ts'

const ROOT = process.cwd()

const token = (surface, dictionaryForm, textIndex, partsOfSpeech = ['名詞']) => ({
  surface,
  dictionaryForm,
  normalizedForm: dictionaryForm,
  reading: dictionaryForm,
  dictionaryReading: dictionaryForm,
  partsOfSpeech,
  textIndex,
  begin: 0,
  end: surface.length,
})

test('practice analytics tracks paper coverage, options, targets, categories and years', () => {
  const documents = [
    {
      paperId: 'paper-1',
      year: '2025',
      category: 'TEXT_VOCAB',
      kind: 'question',
      text: '環境 AI 環境',
    },
    {
      paperId: 'paper-1',
      year: '2025',
      category: 'TEXT_VOCAB',
      kind: 'question',
      text: '環境',
    },
    {
      paperId: 'paper-2',
      year: '2026',
      category: 'READING',
      kind: 'option',
      text: '環境 SNS',
    },
    {
      paperId: 'paper-2',
      year: '2026',
      category: 'TEXT_VOCAB',
      kind: 'target',
      text: '環境',
    },
  ]
  const tokens = [
    token('環境', '環境', 0),
    token('AI', 'AI', 0),
    token('環境', '環境', 0),
    token('環境', '環境', 1),
    token('環境', '環境', 2),
    token('SNS', 'SNS', 2),
    token('環境', '環境', 3),
  ]
  const analytics = buildPracticeVocabularyAnalytics({
    documents,
    tokens,
    totalPapers: 2,
  })
  const environment = analytics.words.find(row => row.word === '環境')

  assert.equal(environment.count, 2)
  assert.equal(environment.paperCount, 2)
  assert.equal(environment.coverageRate, 100)
  assert.equal(environment.optionCount, 1)
  assert.equal(environment.targetCount, 1)
  assert.equal(environment.categoryCounts.TEXT_VOCAB, 1)
  assert.equal(environment.categoryCounts.READING, 1)
  assert.equal(environment.yearCounts['2025'], 1)
  assert.equal(environment.yearCounts['2026'], 1)
  assert.deepEqual(analytics.years, ['2025', '2026'])
  assert.deepEqual(
    rankPracticeVocabularyTrendWords(analytics.words, analytics.years).map(
      row => row.word,
    ),
    ['環境'],
  )
  assert.equal(analytics.totalOccurrences, 4)
  assert.equal(analytics.kanji.find(row => row.character === '環').count, 4)
  assert.equal(
    isSudachiContentWord(token('AI', 'AI', 0)),
    true,
  )
})

test('practice analytics prioritizes direct targets without assuming a fixed user level', () => {
  const documents = [
    {
      paperId: 'paper-1',
      year: '2026',
      category: 'READING',
      kind: 'body',
      text: 'こと こと こと こと こと こと こと こと こと こと 取り組む',
    },
    {
      paperId: 'paper-2',
      year: '2025',
      category: 'TEXT_VOCAB',
      kind: 'target',
      text: '取り組む',
    },
  ]
  const tokens = [
    ...Array.from({ length: 10 }, () => token('こと', 'こと', 0)),
    token('取り組む', '取り組む', 0, ['動詞']),
    token('取り組む', '取り組む', 1, ['動詞']),
  ]
  const analytics = buildPracticeVocabularyAnalytics({
    documents,
    tokens,
    totalPapers: 2,
  })
  const frequent = analytics.words.find(row => row.word === 'こと')
  const candidate = analytics.words.find(row => row.word === '取り組む')

  assert.ok(candidate.learningValue > frequent.learningValue)
  assert.equal(analytics.words[0].word, '取り組む')
})

const profileKeys = ['TEXT_VOCAB', 'GRAMMAR', 'READING', 'LISTENING']

const expectedProfile = (analytics, key) => {
  const matching = analytics.words.filter(row => row.categoryCounts[key] > 0)
  return {
    key,
    label: analytics.profiles.find(profile => profile.key === key).label,
    totalOccurrences: matching.reduce(
      (sum, row) => sum + row.categoryCounts[key],
      0,
    ),
    uniqueWords: matching.length,
    topWords: [...matching]
      .sort(
        (left, right) =>
          right.learningValue - left.learningValue ||
          right.categoryCounts[key] - left.categoryCounts[key] ||
          left.word.localeCompare(right.word, 'ja'),
      )
      .slice(0, 20)
      .map(row => ({ word: row.word, count: row.categoryCounts[key] })),
  }
}

test('practice profile aggregation preserves result semantics and tie order', () => {
  const build = words => {
    const document = {
      paperId: 'paper-1',
      year: '2026',
      category: 'READING',
      kind: 'body',
      text: words.join(' '),
    }
    return buildPracticeVocabularyAnalytics({
      documents: [document],
      tokens: words.map(word => token(word, word, 0)),
      totalPapers: 1,
    })
  }

  const empty = buildPracticeVocabularyAnalytics({
    documents: [],
    tokens: [],
    totalPapers: 0,
  })
  assert.deepEqual(
    empty.profiles.map(profile => ({
      totalOccurrences: profile.totalOccurrences,
      uniqueWords: profile.uniqueWords,
      topWords: profile.topWords,
    })),
    profileKeys.map(() => ({ totalOccurrences: 0, uniqueWords: 0, topWords: [] })),
  )

  const fewerThanTwenty = build(['環境', '取り組む', '学習'])
  assert.deepEqual(
    fewerThanTwenty.profiles,
    profileKeys.map(key => expectedProfile(fewerThanTwenty, key)),
  )

  const tiedWords = Array.from({ length: 25 }, (_, index) =>
    `語${String.fromCodePoint(0x4e00 + index)}`,
  )
  const moreThanTwenty = build(tiedWords)
  assert.deepEqual(
    moreThanTwenty.profiles,
    profileKeys.map(key => expectedProfile(moreThanTwenty, key)),
  )
  assert.equal(moreThanTwenty.profiles[2].topWords.length, 20)

  const collator = new Intl.Collator('ja')
  const sortSamples = ['あ', 'ア', 'い', 'イ', '愛', '藍', '漢字', 'かんじ', 'カンジ']
  for (const left of sortSamples) {
    for (const right of sortSamples) {
      assert.equal(
        Math.sign(collator.compare(left, right)),
        Math.sign(left.localeCompare(right, 'ja')),
        `Japanese tie-breaker differs for ${left} and ${right}`,
      )
    }
  }
})

test('practice analytics summary keeps charts and top items without detail fields', () => {
  const analytics = buildPracticeVocabularyAnalytics({
    documents: [{
      paperId: 'paper-1',
      year: '2026',
      category: 'READING',
      kind: 'body',
      text: '環境 取り組む',
    }],
    tokens: [
      token('環境', '環境', 0),
      token('取り組む', '取り組む', 0, ['動詞']),
    ],
    totalPapers: 1,
  })
  const summary = buildPracticeVocabularyAnalyticsSummary(analytics)

  assert.equal(summary.wordCount, analytics.words.length)
  assert.equal(summary.kanji.length <= 20, true)
  assert.deepEqual(
    Object.keys(summary.topItems.words[0]).sort(),
    ['count', 'isMastered', 'optionCount', 'targetCount', 'word', 'yearCounts'],
  )
  assert.deepEqual(summary.topItems.rankings.trends, [])
})

test('practice analytics matches personal wordbooks and mastered preferences', () => {
  const documents = [
    {
      paperId: 'paper-1',
      year: '2026',
      category: 'READING',
      kind: 'body',
      text: '環境 取り組む',
    },
  ]
  const analytics = buildPracticeVocabularyAnalytics({
    documents,
    tokens: [
      token('環境', '環境', 0),
      token('取り組む', '取り組む', 0, ['動詞']),
    ],
    totalPapers: 1,
  })
  const personalized = applyPracticeVocabularyKnowledge(
    analytics,
    [{
      word: '環境',
      wordbookIds: ['book-n1'],
    }],
    ['取り組む'],
    [{
      id: 'book-n1',
      name: 'N1',
      pathLabel: '红宝书 / N1',
      depth: 0,
      totalCount: 1,
    }],
  )
  const environment = personalized.words.find(row => row.word === '環境')
  const candidate = personalized.words.find(row => row.word === '取り組む')

  assert.equal(environment.wordbookIds.length > 0, true)
  assert.deepEqual(environment.wordbookIds, ['book-n1'])
  assert.equal(candidate.isMastered, true)
  assert.equal(personalized.wordbooks[0].id, 'book-n1')
})

test('practice analytics exposes only real wordbooks with explicit series paths', () => {
  assert.deepEqual(
    buildPracticeVocabularyWordbookOptions([
      { id: 'n1', title: 'N1', seriesTitle: '红宝书', seriesId: 'red', count: 3053 },
      { id: 'n2', title: 'N2', seriesTitle: '红宝书', seriesId: 'red', count: 2328 },
    ]),
    [
      { id: 'n1', name: 'N1', pathLabel: '红宝书 / N1', seriesId: 'red', seriesTitle: '红宝书', depth: 0, totalCount: 3053 },
      { id: 'n2', name: 'N2', pathLabel: '红宝书 / N2', seriesId: 'red', seriesTitle: '红宝书', depth: 0, totalCount: 2328 },
    ],
  )
})

test('wordbook scope options preserve authored order, empty lists and distinct series identities', () => {
  const options = buildPracticeVocabularyWordbookOptions([
    { id: 'list-z', title: '第二课', seriesId: 'book-a', seriesTitle: '同名单词书', count: 0 },
    { id: 'list-a', title: '第一课', seriesId: 'book-b', seriesTitle: '同名单词书', count: 2 },
    { id: 'list-b', title: '第三课', seriesId: 'book-a', seriesTitle: '同名单词书', count: 3 },
  ])
  assert.deepEqual(options.map(row => row.id), ['list-z', 'list-a', 'list-b'])
  assert.deepEqual(options.filter(row => row.seriesId === 'book-a').map(row => row.id), ['list-z', 'list-b'])
  assert.equal(options[0].totalCount, 0)
})

test('practice page exposes the vocabulary analysis dialog and source builder', async () => {
  const [page, client, launcher, server, domain, route, wordbookRoute, wordsRoute] = await Promise.all([
    readFile(path.join(ROOT, 'app/practice/page.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'modules/practice/components/PapersListClient.tsx'), 'utf8'),
    readFile(
      path.join(ROOT, 'modules/practice/components/PracticeInsightsLaunchers.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/practice/server/vocabulary-analytics.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/practice/domain/vocabulary-analytics.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/api/practice/vocabulary-analytics/route.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/api/practice/vocabulary-wordbooks/route.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/api/practice/vocabulary-analytics/words/route.ts'),
      'utf8',
    ),
  ])

  assert.match(page, /PapersListClient/)
  assert.match(client, /VocabularyAnalyticsLauncher/)
  assert.match(launcher, /disabled=\{disabled\}/)
  assert.doesNotMatch(
    launcher,
    /disabled=\{disabled \|\| loadState === 'loading'\}/,
  )
  assert.match(domain, /文字・語彙/)
  assert.match(domain, /applyPracticeVocabularyKnowledge/)
  assert.match(server, /correctOptionTexts/)
  assert.match(server, /dialogueText/)
  assert.match(server, /cleanAnalyticsText/)
  assert.match(server, /wordbookLinksPromise/)
  assert.match(server, /vocabulary\.word = ANY\(\$\{candidateWords\}\)/)
  assert.match(server, /getPracticeVocabularyWordbookEntries/)
  assert.match(wordbookRoute, /searchParams/)
  assert.match(route, /practice-vocabulary-analytics-v10/)
  assert.match(route, /Server-Timing/)
  assert.match(route, /serializationMs/)
  assert.match(route, /getPracticeVocabularyAnalyticsSummary/)
  assert.doesNotMatch(route, /personalizePracticeVocabularyAnalytics/)
  assert.match(launcher, /vocabulary-analytics\/words\?all=true/)
  assert.match(wordsRoute, /personalizePracticeVocabularyAnalytics/)
  assert.match(wordsRoute, /profile/)
  assert.match(wordsRoute, /page/)
  assert.match(wordsRoute, /limit/)
  assert.match(wordsRoute, /hasNextPage/)
  assert.match(server, /SUDACHI_ANALYSIS_BATCH_CHARACTERS/)
  assert.match(server, /documentIndexes\[token\.textIndex\]/)
  assert.match(server, /if \(!analysis\.available\)/)
})

test('mastered vocabulary preferences are persisted per user', async () => {
  const [route, schema] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/api/practice/vocabulary-preferences/route.ts'),
      'utf8',
    ),
    readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8'),
  ])

  assert.match(route, /getCurrentUserId/)
  assert.match(route, /userId_normalizedWord/)
  assert.match(route, /deleteMany/)
  assert.match(schema, /model PracticeVocabularyPreference/)
  assert.match(schema, /@@unique\(\[userId, normalizedWord\]\)/)
  assert.match(
    schema,
    /model PracticeVocabularyPreference[\s\S]*onDelete: Cascade/,
  )
})

test('word locations deduplicate paper/category pairs and preserve source paper order', () => {
  const documents = [
    { paperId: 'b', paperTitle: '2025年7月N1', year: '2025', category: 'READING', kind: 'body', text: '環境' },
    { paperId: 'b', paperTitle: '2025年7月N1', year: '2025', category: 'READING', kind: 'option', text: '環境' },
    { paperId: 'b', paperTitle: '2025年7月N1', year: '2025', category: 'GRAMMAR', kind: 'question', text: '環境' },
    { paperId: 'a', paperTitle: '2024年12月N1', year: '2024', category: 'LISTENING', kind: 'body', text: '環境' },
    { paperId: 'c', paperTitle: 'Target only', year: '2024', category: 'TEXT_VOCAB', kind: 'target', text: '環境' },
  ]
  const analytics = buildPracticeVocabularyAnalytics({ documents, tokens: documents.map((_, index) => token('環境', '環境', index)), totalPapers: 3 })
  const row = analytics.words.find(word => word.word === '環境')
  assert.deepEqual(row.occurrences, [
    { paperId: 'b', paperTitle: '2025年7月N1', categories: ['GRAMMAR', 'READING'] },
    { paperId: 'a', paperTitle: '2024年12月N1', categories: ['LISTENING'] },
  ])
  assert.equal(row.paperCount, row.occurrences.length)
  assert.equal(row.count, row.occurrences.reduce((sum, location) => sum + location.categories.length, 0))
  assert.equal(row.coverageRate, 66.7)
  const personalized = applyPracticeVocabularyKnowledge(analytics, [], ['環境'])
  assert.deepEqual(personalized.words[0].occurrences, row.occurrences)
  assert.equal(analytics.words[0].isMastered, false)
  assert.equal(personalized.words[0].isMastered, true)
})
