import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

// Guards the A01 groups-cache invalidation audit: every application path
// that mutates Vocabulary rows or wordbook memberships must bust the
// `vocabulary-groups` tag, otherwise the cached tab counts go stale.
// (One-off scripts/* maintenance jobs are covered by the 300s TTL instead.)
const ROOT = process.cwd()
const read = relative => readFile(path.join(ROOT, relative), 'utf8')

const countOccurrences = (content, marker) =>
  content.split(marker).length - 1

test('active paged groups query is cached with a bounded TTL', async () => {
  const repository = await read(
    'modules/knowledge/vocabulary/server/repository.ts',
  )
  const pageRepository = await read('modules/knowledge/vocabulary/server/page-repository.ts')
  assert.match(pageRepository, /unstable_cache/)
  assert.match(repository, /VOCABULARY_GROUPS_CACHE_TAG = 'vocabulary-groups'/)
  assert.match(pageRepository, /revalidate: 300/)
  assert.match(
    repository,
    /export function invalidateVocabularyGroupsCache\(\)/,
  )
  // userId travels inside the cache key: no cross-user leaks.
  assert.match(pageRepository, /getCachedVocabularyPageGroups\(userId,/)
  assert.doesNotMatch(repository, /export async function listVocabularyGroups\(/)
})

test('every vocabulary row writer busts the groups cache', async () => {
  const [actions, inspector, admin, anki] = await Promise.all([
    read('modules/knowledge/vocabulary/actions.ts'),
    read('modules/knowledge/vocabulary/inspector-actions.ts'),
    read('modules/knowledge/vocabulary/admin-actions.ts'),
    read('modules/import/anki-actions.ts'),
  ])
  // save/create, delete, tags, inspector, admin delete/update/
  // batch/csv-import/merge, anki bulk import.
  // NOTE: modules/knowledge/vocabulary/entry-actions.ts (currently untracked)
  // carries the same one-line call in the working tree; it is covered by the
  // 300s TTL until that file lands in version control.
  assert.ok(countOccurrences(actions, 'invalidateVocabularyGroupsCache()') >= 3)
  assert.ok(countOccurrences(inspector, 'invalidateVocabularyGroupsCache()') >= 1)
  assert.ok(countOccurrences(admin, 'invalidateVocabularyGroupsCache()') >= 5)
  assert.match(anki, /updateTag\(VOCABULARY_GROUPS_CACHE_TAG\)/)
})

test('every wordbook membership writer busts the groups cache', async () => {
  const wordbooks = await read('modules/knowledge/wordbooks/actions.ts')
  // Single choke point: all mutations funnel through revalidateWordbooks.
  const helper = wordbooks.slice(wordbooks.indexOf('const revalidateWordbooks'))
  assert.match(helper.slice(0, 400), /invalidateVocabularyGroupsCache\(\)/)
  assert.ok(countOccurrences(wordbooks, 'revalidateWordbooks(') >= 6)
})

test('centralized Prisma extension covers all writers without per-site code', async () => {
  const client = await read('lib/prisma.ts')
  assert.match(client, /\$extends\(/)
  assert.match(client, /\$allModels/)
  assert.match(client, /\$allOperations/)
  for (const model of ['Vocabulary', 'WordbookVocabulary', 'Wordbook', 'WordbookSeries']) {
    assert.match(client, new RegExp(`'${model}'`), `model ${model}`)
  }
  for (const operation of [
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
  ]) {
    assert.match(client, new RegExp(`'${operation}'`), `operation ${operation}`)
  }
  // Same tag as the explicit helper: busts are idempotent across both paths.
  assert.match(client, /revalidateTag\('vocabulary-groups', 'max'\)/)
  // Non-request contexts (scripts/build) must not crash writes.
  assert.match(client, /catch \{/)
  // The extension keeps the exact PrismaClient API so existing
  // TransactionClient-typed call sites keep compiling.
  assert.match(client, /as unknown as PrismaClient/)
})

test('wordbook options reuse the same cache tag', async () => {
  const repository = await read(
    'modules/knowledge/wordbooks/repository.ts',
  )
  assert.match(repository, /unstable_cache/)
  assert.match(repository, /VOCABULARY_GROUPS_CACHE_TAG/)
  assert.match(repository, /getCachedWordbookOptions\(\)/)
})
