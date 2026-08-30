import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  applyPracticeVocabularyKnowledge,
  buildPracticeVocabularyWordbookOptions,
  buildPracticeVocabularyAnalytics,
  rankPracticeVocabularyTrendWords,
} from '../features/practice/domain/vocabulary-analytics.ts'
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
      wordbookIds: ['book-n1', 'book-root'],
      wordbookNames: ['红宝书 / N1'],
    }],
    ['取り組む'],
    [{
      id: 'book-root',
      name: '红宝书',
      pathLabel: '红宝书',
      depth: 0,
      totalCount: 1,
    }],
  )
  const environment = personalized.words.find(row => row.word === '環境')
  const candidate = personalized.words.find(row => row.word === '取り組む')

  assert.equal(environment.inWordbook, true)
  assert.deepEqual(environment.wordbookIds, ['book-n1', 'book-root'])
  assert.deepEqual(environment.wordbookNames, ['红宝书 / N1'])
  assert.equal(candidate.isMastered, true)
  assert.equal(personalized.wordbooks[0].id, 'book-root')
})

test('practice analytics builds selectable parent and child wordbooks', () => {
  assert.deepEqual(
    buildPracticeVocabularyWordbookOptions([
      { id: 'root', title: '红宝书', parentId: null, count: 0 },
      { id: 'n1', title: 'N1', parentId: 'root', count: 3053 },
      { id: 'n2', title: 'N2', parentId: 'root', count: 2328 },
    ]),
    [
      { id: 'root', name: '红宝书', pathLabel: '红宝书', depth: 0, totalCount: 5381 },
      { id: 'n1', name: 'N1', pathLabel: '红宝书 / N1', depth: 1, totalCount: 3053 },
      { id: 'n2', name: 'N2', pathLabel: '红宝书 / N2', depth: 1, totalCount: 2328 },
    ],
  )
})

test('practice page exposes the vocabulary analysis dialog and source builder', async () => {
  const [page, client, launcher, dialog, server, domain, route, wordbookRoute] = await Promise.all([
    readFile(path.join(ROOT, 'app/(study)/practice/page.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'app/(study)/practice/PapersListClient.tsx'), 'utf8'),
    readFile(
      path.join(ROOT, 'features/practice/ui/PracticeInsightsLaunchers.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'features/practice/ui/PracticeVocabularyAnalyticsDialog.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'features/practice/server/vocabulary-analytics.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'features/practice/domain/vocabulary-analytics.ts'),
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
  ])

  assert.match(page, /PapersListClient/)
  assert.match(client, /VocabularyAnalyticsLauncher/)
  assert.match(launcher, /disabled=\{disabled\}/)
  assert.doesNotMatch(
    launcher,
    /disabled=\{disabled \|\| loadState === 'loading'\}/,
  )
  assert.match(dialog, /学习价值/)
  assert.match(dialog, /显示已熟练词/)
  assert.match(dialog, /标记熟练/)
  assert.match(dialog, /恢复推荐/)
  assert.match(dialog, /优先学习词汇/)
  assert.match(dialog, /选项词频/)
  assert.match(dialog, /片假名词频/)
  assert.match(dialog, /二字熟语/)
  assert.match(dialog, /汉字考点/)
  assert.match(domain, /文字・語彙/)
  assert.match(domain, /applyPracticeVocabularyKnowledge/)
  assert.match(dialog, /年份趋势/)
  assert.doesNotMatch(dialog, /const examples = \['AI', 'SNS'/)
  assert.match(dialog, /rankPracticeVocabularyTrendWords/)
  assert.match(server, /correctOptionTexts/)
  assert.match(server, /dialogueText/)
  assert.match(server, /cleanAnalyticsText/)
  assert.match(server, /prisma\.vocabulary\.findMany/)
  assert.match(dialog, /选择单词书（可多选）/)
  assert.match(dialog, /未加入任何单词书/)
  assert.match(server, /VOCABULARY_MATCH_BATCH_SIZE/)
  assert.match(server, /word: \{ in: words \}/)
  assert.match(server, /getPracticeVocabularyWordbookEntries/)
  assert.match(wordbookRoute, /searchParams/)
  assert.match(dialog, /count: 0/)
  assert.match(dialog, /正在读取单词书/)
  assert.match(route, /practice-vocabulary-analytics-v6/)
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
