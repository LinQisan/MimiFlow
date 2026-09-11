import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildPracticeTitle,
  buildRandomPracticeFilterOptions,
} from '../modules/practice/domain/custom-session.ts'

const ROOT = process.cwd()
const read = relative => readFile(path.join(ROOT, relative), 'utf8')

test('buildPracticeTitle formats titles with counts, collections, and scopes', () => {
  assert.equal(
    buildPracticeTitle(10, ['2023年7月 N1', '2023年12月 N1']),
    '随机练习 · 10 题 · 2023年7月 N1 / 2023年12月 N1',
  )
  assert.equal(
    buildPracticeTitle(15, [], { language: 'ja', level: 'N1', scope: 'unattempted' }),
    '随机练习 · 15 题（未做题，语言=ja，等级=N1）',
  )
  assert.equal(
    buildPracticeTitle(20, ['A', 'B', 'C', 'D'], { scope: 'attempted' }),
    '随机练习 · 20 题（已做题） · A / B / C 等 4 套',
  )
})

test('practice filter levels stay scoped to their language', () => {
  assert.deepEqual(
    buildRandomPracticeFilterOptions([
      { language: ' ja ', level: 'N2' },
      { language: 'ja', level: 'N1' },
      { language: 'en', level: 'TOEIC' },
      { language: 'ja', level: 'N1' },
      { language: null, level: '通用' },
    ]),
    {
      languages: ['en', 'ja'],
      levels: ['N1', 'N2', 'TOEIC', '通用'],
      levelsByLanguage: {
        en: ['TOEIC'],
        ja: ['N1', 'N2'],
      },
    },
  )
})

test('custom practice creates a session, redirects to ?session=, and never re-draws on refresh', async () => {
  const customDoingPage = await read('app/practice/custom/do/page.tsx')
  const sessionService = await read('modules/practice/server/custom-session-service.ts')
  const builderClient = await read('modules/practice/components/CustomPaperBuilderClient.tsx')
  const player = await read('modules/practice/components/PracticePlayer.tsx')
  const schema = await read('prisma/schema.prisma')

  // Schema stores the persistent session
  assert.match(schema, /model CustomPracticeSession/)
  assert.match(schema, /questionIds\s+String\[\]/)
  assert.match(schema, /customPracticeSessions\s+CustomPracticeSession\[\]/)

  // Page reads session parameter to restore existing attempt
  assert.match(customDoingPage, /const sessionId = toFirstValue\(resolved\.session\)/)
  assert.match(customDoingPage, /await getCustomPracticeSession\(sessionId\)/)
  assert.match(customDoingPage, /draftKey=\{`practice:draft:custom:\${session\.id}`\}/)
  assert.match(customDoingPage, /restartHref=/)

  // When sections/count are passed, it creates once and redirects to session URL
  assert.match(customDoingPage, /await createCustomPracticeSession\(/)
  assert.match(customDoingPage, /redirect\(`\/practice\/custom\/do\?session=/)

  // Restarting generates a new session and redirects to that new session
  assert.match(customDoingPage, /await restartCustomPracticeSession\(restartId\)/)
  assert.match(customDoingPage, /redirect\(`\/practice\/custom\/do\?session=/)

  // Service retrieves exact questions by stored IDs without re-sampling
  assert.match(sessionService, /getExamQuestionsByIds\(session\.questionIds/)
  assert.match(sessionService, /prisma\.customPracticeSession\.create/)

  // Player wires restart button
  assert.match(player, /restartHref &&/)
  assert.match(player, /重新抽题/)
  assert.match(player, /session\.clearDraft\(\)/)

  // Builder client offers returning to active session
  assert.match(builderClient, /activeSession &&/)
  assert.match(builderClient, /上次练习尚未结束/)
  assert.match(builderClient, /继续练习/)
})

test('multi-question materials are sampled as intact question groups without splitting subquestions', async () => {
  const repository = await read('lib/repositories/exam/index.ts')

  // Group key resolution uses material id for shared materials (listening, reading, shared payload)
  assert.match(repository, /function getQuestionGroupKey/)
  assert.match(repository, /question\.material\.type === MaterialType\.LISTENING/)
  assert.match(repository, /question\.material\.type === MaterialType\.READING/)
  assert.match(repository, /`material:\${question\.materialId}`/)
  assert.match(repository, /`question:\${question\.id}`/)

  // Groups map collects all sibling questions belonging to the parent material
  assert.match(repository, /const groupsMap = new Map/)
  assert.match(repository, /existing\.questions\.push\(question\)/)

  // Scope is evaluated on the whole group: unattempted requires every child to be unattempted
  assert.match(repository, /group\.questions\.every\(\(q\) => q\.attempts\.length === 0\)/)
  assert.match(repository, /group\.questions\.some\(\(q\) => q\.attempts\.length > 0\)/)

  // Sampling is performed on question groups, taking requestedCount groups
  assert.match(repository, /const selectedGroups = shuffleList\(matchingGroups\)\.slice\(\s*0,\s*Math\.max\(0, Math\.floor\(requestedCount\)\),?\s*\)/)

  // All child questions of each selected group are returned consecutively in original order
  assert.match(repository, /selectedGroups\.flatMap\(\(group\) => group\.questions\.map\(\(q\) => q\.id\)\)/)
})
