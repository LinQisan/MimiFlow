import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib', 'modules', 'utils']

async function sourceFiles(directory) {
  const absolute = path.join(ROOT, directory)
  const entries = await readdir(absolute)
  const files = []
  for (const entry of entries) {
    const target = path.join(absolute, entry)
    const info = await stat(target)
    if (info.isDirectory()) {
      files.push(...(await sourceFiles(path.relative(ROOT, target))))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(target)
    }
  }
  return files
}

test('routes compose modules instead of owning business implementation files', async () => {
  const routeFiles = await sourceFiles('app')
  const allowedRouteFiles = new Set([
    'page.tsx',
    'layout.tsx',
    'loading.tsx',
    'error.tsx',
    'not-found.tsx',
    'route.ts',
  ])

  const violations = routeFiles
    .filter(file => !allowedRouteFiles.has(path.basename(file)))
    .map(file => path.relative(ROOT, file))

  assert.deepEqual(violations, [])
})

test('removed product routes are not referenced by source code', async () => {
  const files = (
    await Promise.all(SOURCE_DIRS.map(directory => sourceFiles(directory)))
  ).flat()
  const removedRoutes = [
    '/game',
    '/today',
    '/sentences',
    '/articles',
    '/ebooks',
    '/exam',
    '/shadowing',
    '/media-subtitles',
    '/wordbooks',
    '/anki',
    '/settings',
    '/search/result',
    '/manage/upload',
    '/manage/papers',
    '/manage/audio',
    '/manage/fsrs',
    '/grammar/edit',
  ]
  const violations = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const route of removedRoutes) {
      const routeLiteral = new RegExp(`['"\`]${route}(?:/|['"\`?])`)
      if (routeLiteral.test(content)) {
        violations.push(`${path.relative(ROOT, file)} -> ${route}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('route, persistence, validation, and action boundaries stay explicit', async () => {
  const files = (
    await Promise.all(SOURCE_DIRS.map(directory => sourceFiles(directory)))
  ).flat()
  const violations = []

  for (const file of files) {
    const relative = path.relative(ROOT, file)
    const content = await readFile(file, 'utf8')

    if (
      /^(app|components)\/.+\.tsx$/.test(relative) &&
      /(?:@\/lib\/prisma|\bprisma\.)/.test(content)
    ) {
      violations.push(`${relative} -> direct Prisma access`)
    }

    if (
      relative !== 'app/layout.tsx' &&
      /from\s+['"]@\/app\//.test(content)
    ) {
      violations.push(`${relative} -> route-to-route import`)
    }

    if (/\b(?:asRecord|asString|asBoolean|asFiniteNumber)\b/.test(content)) {
      violations.push(`${relative} -> legacy unknown-value coercion`)
    }

    if (
      /\b(?:toLegacyMaterialId|toMaterialId|legacyId|ByLegacyId)\b|endsWith:\s*`?:/.test(
        content,
      )
    ) {
      violations.push(`${relative} -> legacy material ID path`)
    }

    if (/readJsonRecord\([^\n]*contentPayload/.test(content)) {
      violations.push(`${relative} -> material payload bypasses codec`)
    }
  }

  assert.deepEqual(violations, [])
})

test('shared question rules and pronunciation stay in their shared modules', async () => {
  const files = (
    await Promise.all(SOURCE_DIRS.map(directory => sourceFiles(directory)))
  ).flat()
  const violations = []

  for (const file of files) {
    const relative = path.relative(ROOT, file)
    const content = await readFile(file, 'utf8')
    if (content.includes('components/questions/domain')) {
      violations.push(`${relative} -> component-owned shared question domain`)
    }
    if (content.includes('/api/practice/pronunciation')) {
      violations.push(`${relative} -> feature-specific pronunciation endpoint`)
    }
    if (content.includes('modules/reading/domain/sudachi')) {
      violations.push(`${relative} -> reading-owned shared language domain`)
    }
    if (content.includes('modules/reading/components/PronunciationSourceSelector')) {
      violations.push(`${relative} -> reading-owned shared pronunciation control`)
    }
  }

  assert.deepEqual(violations, [])
})

test('content import filters collections by explicit material capabilities', async () => {
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
  const repository = await readFile(
    path.join(ROOT, 'lib/repositories/manage/index.ts'),
    'utf8',
  )
  const importPage = await readFile(
    path.join(ROOT, 'app/manage/import/page.tsx'),
    'utf8',
  )
  assert.match(schema, /provider = "postgresql"/)
  assert.match(schema, /acceptedMaterialTypes MaterialType\[\]/)
  assert.match(repository, /acceptedMaterialTypes: \{ has: materialType \}/)
  assert.match(importPage, /reading: 'READING'/)
})

test('schema keeps one vocabulary organization model and a typed question', async () => {
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
  assert.equal(schema.includes('model VocabularyFolder'), false)
  assert.equal(schema.includes('groupName'), false)
  assert.equal(schema.includes('model GameSessionLog'), false)
  assert.equal(schema.includes('model OutputPractice'), false)
  assert.match(schema, /questionType\s+QuestionType/)
  assert.match(
    schema,
    /templateType\s+QuestionTemplate\s+@default\(CHOICE_QUIZ\)\s+@map\("template_type"\)/,
  )
  assert.match(schema, /model User/)
  assert.match(schema, /model UserQuestionNote/)
  assert.match(schema, /userId\s+String\s+@map\("user_id"\)/)
})

test('local users own learning records and can be created or switched', async () => {
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
  const currentUser = await readFile(
    path.join(ROOT, 'modules/users/server/current-user.ts'),
    'utf8',
  )
  const userActions = await readFile(
    path.join(ROOT, 'modules/users/actions.ts'),
    'utf8',
  )
  const attemptService = await readFile(
    path.join(ROOT, 'modules/practice/server/attempt-service.ts'),
    'utf8',
  )
  const navigation = await readFile(
    path.join(ROOT, 'components/layout/StudyNavigation.tsx'),
    'utf8',
  )
  const practiceSession = await readFile(
    path.join(ROOT, 'modules/practice/hooks/usePracticeSession.ts'),
    'utf8',
  )

  assert.match(schema, /model User \{/)
  assert.match(schema, /model UserQuestionNote \{/)
  assert.match(schema, /questionAttempts\s+QuestionAttempt\[\]/)
  assert.match(schema, /practiceSubmissions\s+PracticePaperSubmission\[\]/)
  assert.match(currentUser, /CURRENT_USER_COOKIE/)
  assert.match(currentUser, /await cookies\(\)/)
  assert.match(userActions, /export async function createUser/)
  assert.match(userActions, /export async function switchUser/)
  assert.match(userActions, /cookieStore\.set\(CURRENT_USER_COOKIE/)
  assert.match(attemptService, /const userId = await getCurrentUserId\(\)/)
  assert.match(attemptService, /userId_questionId/)
  assert.match(navigation, /<UserSwitcher currentUser=\{currentUser\} users=\{users\} \/>/)
  assert.match(practiceSession, /userStorageKey\(currentUser\.id, draftKey\)/)
})
