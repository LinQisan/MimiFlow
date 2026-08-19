import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { buildPaperFrequencyDocuments } from '../features/practice/domain/paper-word-frequency.ts'

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

test('paper overview exposes Sudachi word frequency in a dialog', async () => {
  const [page, repository, dialog, nextConfig] = await Promise.all([
    readFile(path.join(ROOT, 'app/(study)/practice/[id]/page.tsx'), 'utf8'),
    readFile(path.join(ROOT, 'lib/repositories/exam/index.ts'), 'utf8'),
    readFile(
      path.join(ROOT, 'features/practice/ui/PaperWordFrequencyDialog.tsx'),
      'utf8',
    ),
    readFile(path.join(ROOT, 'next.config.ts'), 'utf8'),
  ])

  assert.match(page, /buildPaperFrequencyDocuments/)
  assert.match(page, /getSudachiPronunciationMap/)
  assert.match(page, /PaperWordFrequencyDialog/)
  assert.match(repository, /dialogueTranscript/)
  assert.match(repository, /options: asArray/)
  assert.match(dialog, /听力原文、题干和全部选项/)
  assert.match(nextConfig, /'\/practice\/\*'/)
})
