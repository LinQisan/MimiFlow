import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { buildPracticeVocabularyAnalytics } from '../features/practice/domain/vocabulary-analytics.ts'
import { isSudachiContentWord } from '../features/reading/domain/sudachi.ts'

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
    token('SNS', 'SNS', 1),
    token('環境', '環境', 2),
  ]
  const analytics = buildPracticeVocabularyAnalytics({
    documents,
    tokens,
    totalPapers: 2,
  })
  const environment = analytics.words.find(row => row.word === '環境')

  assert.equal(environment.count, 3)
  assert.equal(environment.paperCount, 2)
  assert.equal(environment.coverageRate, 100)
  assert.equal(environment.optionCount, 1)
  assert.equal(environment.targetCount, 1)
  assert.equal(environment.categoryCounts.TEXT_VOCAB, 2)
  assert.equal(environment.categoryCounts.READING, 1)
  assert.equal(environment.yearCounts['2025'], 2)
  assert.equal(environment.yearCounts['2026'], 1)
  assert.equal(analytics.totalOccurrences, 5)
  assert.equal(analytics.kanji.find(row => row.character === '環').count, 3)
  assert.equal(
    isSudachiContentWord(token('AI', 'AI', 0)),
    true,
  )
})

test('practice page exposes the vocabulary analysis dialog and source builder', async () => {
  const [page, client, dialog, server, domain] = await Promise.all([
    readFile(path.join(ROOT, 'app/(study)/practice/page.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'app/(study)/practice/PapersListClient.tsx'), 'utf8'),
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
  ])

  assert.match(page, /getPracticeVocabularyAnalytics/)
  assert.match(client, /PracticeVocabularyAnalyticsDialog/)
  assert.match(dialog, /试卷覆盖率/)
  assert.match(dialog, /选项词频/)
  assert.match(dialog, /片假名词频/)
  assert.match(dialog, /最常出现的二字熟语/)
  assert.match(dialog, /最常作为考点的汉字词/)
  assert.match(domain, /文字・語彙/)
  assert.match(dialog, /年份趋势/)
  assert.match(server, /correctOptionTexts/)
  assert.match(server, /dialogueText/)
  assert.match(server, /cleanAnalyticsText/)
})
