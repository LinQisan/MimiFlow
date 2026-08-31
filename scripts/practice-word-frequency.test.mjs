import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildPaperFrequencyDocuments,
  buildPaperWordbookDistribution,
} from '../features/practice/domain/paper-word-frequency.ts'

const ROOT = process.cwd()

test('paper frequency includes passages, listening transcripts, prompts and every option', () => {
  const result = buildPaperFrequencyDocuments({
    quizzes: [
      {
        questions: [
          {
            prompt: '問題二の文脈',
            contextSentence: '語彙の文脈',
            options: ['選択肢一', '選択肢二', '選択肢三', '選択肢四'],
          },
        ],
      },
    ],
    passages: [
      {
        content: '読解の本文',
        questions: [{ prompt: '読解の質問', options: ['答え一', '答え二'] }],
      },
    ],
    lessons: [
      {
        transcript: '聴解の原文',
        questions: [{ prompt: '聴解の質問', options: ['音声一', '音声二'] }],
      },
    ],
  })

  assert.ok(result.texts.includes('読解の本文'))
  assert.ok(result.texts.includes('聴解の原文'))
  assert.ok(result.texts.some(text => text.includes('問題二の文脈')))
  assert.ok(result.texts.some(text => text.includes('選択肢四')))
  assert.deepEqual(result.stats, {
    questionCount: 3,
    optionCount: 8,
    readingTextCount: 1,
    listeningTranscriptCount: 1,
  })
})

test('paper frequency reports leaf wordbook coverage and outside words', () => {
  const distribution = buildPaperWordbookDistribution({
    words: ['環境', '環境', '語彙', '未収録'],
    wordbooks: [
      { id: 'n1', name: 'N1', pathLabel: '红宝书 / N1', depth: 0 },
      { id: 'n2', name: 'N2', pathLabel: '红宝书 / N2', depth: 0 },
    ],
    memberships: [
      { word: '環境', wordbookIds: ['n1'] },
      { word: '語彙', wordbookIds: ['n2'] },
    ],
  })

  assert.equal(distribution.totalWords, 3)
  assert.equal(distribution.outsideCount, 1)
  assert.equal(distribution.outsideRate, 33.3)
  assert.deepEqual(distribution.outsideWords, ['未収録'])
  assert.deepEqual(
    distribution.wordbooks.map(row => [row.id, row.matchedCount, row.matchedWords]),
    [
      ['n1', 1, ['環境']],
      ['n2', 1, ['語彙']],
    ],
  )
})

test('wordbook distribution orders matches by coverage before series order', () => {
  const distribution = buildPaperWordbookDistribution({
    words: ['一', '二', '三', '四'],
    wordbooks: [
      { id: 'small', name: '小册', pathLabel: '小册', depth: 0 },
      { id: 'large', name: '大册', pathLabel: '大册', depth: 0 },
    ],
    memberships: [
      { word: '一', wordbookIds: ['small', 'large'] },
      { word: '二', wordbookIds: ['large'] },
      { word: '三', wordbookIds: ['large'] },
    ],
  })

  assert.deepEqual(distribution.wordbooks.map(row => row.id), ['large', 'small'])
})

test('paper overview exposes Sudachi word frequency in a dialog', async () => {
  const [page, repository, dialog, chart, route, server, nextConfig] = await Promise.all([
    readFile(path.join(ROOT, 'app/(study)/practice/[id]/page.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'lib/repositories/exam/index.ts'), 'utf8'),
    readFile(
      path.join(ROOT, 'features/practice/ui/PaperWordFrequencyDialog.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'components/vocabulary/WordbookDistributionChart.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/api/practice/[id]/word-frequency/route.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'features/practice/server/paper-wordbook-distribution.ts'),
      'utf8',
    ),
    readFile(path.join(ROOT, 'next.config.ts'), 'utf8'),
  ])

  assert.match(page, /PaperWordFrequencyDialog/)
  assert.match(route, /buildPaperFrequencyDocuments/)
  assert.match(route, /getSudachiPronunciationMap/)
  assert.match(route, /getPaperWordbookDistribution/)
  assert.match(repository, /dialogueTranscript/)
  assert.match(repository, /options: asArray/)
  assert.match(dialog, /听力原文、题干和全部选项/)
  assert.match(dialog, /WordbookDistributionChart/)
  assert.match(chart, /单词书分布/)
  assert.match(chart, /未加入任何单词书/)
  assert.match(chart, /未收录置底 · 点击查看单词/)
  assert.match(server, /word: \{ in: batch \}/)
  assert.match(server, /seriesTitle: row\.series\.title/)
  assert.doesNotMatch(server, /ancestorIdsFor/)
  assert.match(nextConfig, /'\/practice\/\*'/)
})
