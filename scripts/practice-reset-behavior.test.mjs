import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

// Contract tests for Phase 1 hardening. These read the server sources as text
// because the units under test require a live database; they guard the exact
// regression (ghost retries after reset, cross-user writes) rather than the
// general behavior, which is covered by code review + typecheck.
const ROOT = process.cwd()

const read = relative => readFile(path.join(ROOT, relative), 'utf8')

test('reset clears derived retry state in the same scope', async () => {
  const service = await read('modules/practice/server/attempt-service.ts')
  assert.match(service, /tx\.questionRetry\.deleteMany\(\{ where: \{ userId \} \}\)/)
  assert.match(
    service,
    /tx\.questionRetry\.deleteMany\(\{\s+where: \{ userId, questionId: \{ in: questionIds \} \},?\s+\}\)/,
  )
  assert.match(service, /deletedRetryCount/)
})

test('reset never touches notes, FSRS memory, or other users', async () => {
  const service = await read('modules/practice/server/attempt-service.ts')
  assert.equal(service.includes('userQuestionNote'), false)
  assert.equal(service.includes('vocabularyReview'), false)
  assert.equal(service.includes('sentenceReview'), false)
  assert.equal(service.includes('reviewEvent'), false)
  // Every destructive write in the reset path is user-scoped.
  const resetBody = service.slice(service.indexOf('export async function resetQuizAttemptHistory'))
  const deleteOffsets = [...resetBody.matchAll(/deleteMany\(/g)].map(match => match.index ?? 0)
  assert.ok(deleteOffsets.length >= 5)
  for (const offset of deleteOffsets) {
    assert.match(
      resetBody.slice(offset, offset + 160),
      /userId/,
      'reset write must be user-scoped',
    )
  }
  const route = await read('app/api/quiz-attempts/route.ts')
  assert.match(route, /revalidatePath\('\/review\/mistakes'\)/)
})

test('review writes fail closed on ownership', async () => {
  const memory = await read('modules/review/actions/memory.ts')
  // Sentence cards: the write filter itself carries the owner.
  assert.match(
    memory,
    /tx\.sentenceReview\.updateMany\(\{\s+where: \{ id: reviewId, userId \},/,
  )
  // Vocabulary cards have no userId column: ownership travels the relation.
  assert.match(
    memory,
    /tx\.vocabularyReview\.updateMany\(\{\s+where: \{ id: record\.id, vocabulary: \{ userId \} \},/,
  )
  // The globally-addressed card lookup happens only after the ownership check.
  const ensureBody = memory.slice(memory.indexOf('const ensureVocabularyReviewCard'))
  const ownershipCheck = ensureBody.indexOf('prisma.vocabulary.findFirst')
  const cardLookup = ensureBody.indexOf('prisma.vocabularyReview.findUnique')
  assert.ok(ownershipCheck >= 0 && cardLookup >= 0 && ownershipCheck < cardLookup)

  const mistakes = await read('modules/review/server/mistake-repository.ts')
  assert.match(mistakes, /prisma\.questionRetry\.findFirst\(\{\s+where: \{ id: retryId, userId \},/)
  assert.match(mistakes, /updateMany\(\{\s+where: \{ id: retryId, userId \},/)
  assert.match(mistakes, /deleteMany\(\{\s+where: \{ id: retryId, userId \},/)
})

test('server-only modules cannot leak into client bundles', async () => {
  for (const relative of [
    'modules/practice/server/attempt-service.ts',
    'modules/review/server/mistake-repository.ts',
    'modules/review/server/queries.ts',
    'modules/practice/server/vocabulary-analytics.ts',
    'modules/practice/server/paper-wordbook-distribution.ts',
    'modules/practice/server/custom-session-service.ts',
  ]) {
    const content = await read(relative)
    assert.match(content, /import 'server-only'/, relative)
  }
})
