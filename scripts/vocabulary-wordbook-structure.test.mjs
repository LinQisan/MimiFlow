import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildFolderTree,
  flattenFolderTree,
} from '../modules/knowledge/vocabulary/domain/wordbook-tree.ts'

const ROOT = process.cwd()

test('wordbook navigation keeps hierarchy, paths and descendant totals', () => {
  const tree = buildFolderTree([
    { id: 'book', name: 'N2語彙トレーニング', parentId: null, count: 0 },
    { id: 'unit', name: 'Unit01 名詞A', parentId: 'book', count: 100 },
  ])
  const rows = flattenFolderTree(tree)

  assert.deepEqual(
    rows.map(row => ({
      name: row.name,
      depth: row.depth,
      path: row.pathLabel,
      total: row.totalCount,
    })),
    [
      {
        name: 'N2語彙トレーニング',
        depth: 0,
        path: 'N2語彙トレーニング',
        total: 100,
      },
      {
        name: 'Unit01 名詞A',
        depth: 1,
        path: 'N2語彙トレーニング / Unit01 名詞A',
        total: 100,
      },
    ],
  )
})

test('active wordbook navigation hides legacy archive and preserves hierarchy', async () => {
  const [repository, dropdown, vocabularyTabs] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/wordbooks/repository.ts'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/ControlDropdown.tsx',
      ),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
      'utf8',
    ),
  ])

  assert.match(repository, /startsWith: 'legacy-'/)
  assert.match(repository, /_count: \{ select: \{ entries: true \} \}/)
  assert.match(dropdown, /option\.depth/)
  assert.match(dropdown, /option\.count/)
  assert.match(vocabularyTabs, /selectedLabel: folder\.pathLabel/)
  assert.match(vocabularyTabs, /count: folder\.totalCount/)
})

test('duplicate headwords share one page with ordered wordbook content', async () => {
  const [page, repository, tabs, types] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/server/repository.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/types.ts'),
      'utf8',
    ),
  ])

  assert.match(page, /vocabularyWordKey/)
  assert.match(page, /listVocabularyDetailsByWords/)
  assert.match(page, /N2語彙トレーニング/)
  assert.match(page, /rootTitle === '红宝书'/)
  assert.match(page, /wordbookSources/)
  assert.match(repository, /listVocabularyDetailsByWords/)
  assert.match(tabs, /单词书内容/)
  assert.match(tabs, /wordbook\.pathLabel/)
  assert.match(types, /VocabularyWordbookSource/)
})
