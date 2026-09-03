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

test('groups query is cached with a bounded TTL', async () => {
  const repository = await read(
    'modules/knowledge/vocabulary/server/repository.ts',
  )
  assert.match(repository, /unstable_cache/)
  assert.match(repository, /VOCABULARY_GROUPS_CACHE_TAG = 'vocabulary-groups'/)
  assert.match(repository, /revalidate: 300/)
  assert.match(
    repository,
    /export function invalidateVocabularyGroupsCache\(\)/,
  )
  // userId travels inside the cache key: no cross-user leaks.
  assert.match(repository, /getCachedVocabularyGroups\(userId,/)
})

test('every vocabulary row writer busts the groups cache', async () => {
  const [actions, inspector, admin, anki] = await Promise.all([
    read('modules/knowledge/vocabulary/actions.ts'),
    read('modules/knowledge/vocabulary/inspector-actions.ts'),
    read('features/vocabulary/admin-actions.ts'),
    read('features/import/anki-actions.ts'),
  ])
  // save/create, delete, tags, inspector, admin delete/update/
  // batch/csv-import/merge, anki bulk import.
  // NOTE: modules/knowledge/vocabulary/entry-actions.ts (currently untracked)
  // carries the same one-line call in the working tree; it is covered by the
  // 300s TTL until that file lands in version control.
  assert.ok(countOccurrences(actions, 'invalidateVocabularyGroupsCache()') >= 3)
  assert.ok(countOccurrences(inspector, 'invalidateVocabularyGroupsCache()') >= 1)
  assert.ok(countOccurrences(admin, 'invalidateVocabularyGroupsCache()') >= 5)
  assert.ok(countOccurrences(anki, 'invalidateVocabularyGroupsCache()') >= 1)
})

test('every wordbook membership writer busts the groups cache', async () => {
  const wordbooks = await read('modules/knowledge/wordbooks/actions.ts')
  // Single choke point: all mutations funnel through revalidateWordbooks.
  const helper = wordbooks.slice(wordbooks.indexOf('const revalidateWordbooks'))
  assert.match(helper.slice(0, 400), /invalidateVocabularyGroupsCache\(\)/)
  assert.ok(countOccurrences(wordbooks, 'revalidateWordbooks(') >= 6)
})
