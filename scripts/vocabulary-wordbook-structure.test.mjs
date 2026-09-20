import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { vocabularyPageWhere } from '../modules/knowledge/vocabulary/server/group-page-query.ts'

import {
  listWordbookFilterOptions,
  listWordbooks,
  parseWordbookFilter,
} from '../modules/knowledge/vocabulary/domain/wordbook-list.ts'

const ROOT = process.cwd()

test('wordbook navigation keeps explicit series paths and leaf totals', () => {
  const rows = listWordbooks([
    {
      id: 'unit',
      name: 'Unit01 名詞A',
      seriesId: 'training',
      seriesName: 'N2語彙トレーニング',
      count: 100,
    },
  ])

  assert.deepEqual(
    rows.map(row => ({
      name: row.name,
      depth: row.depth,
      path: row.pathLabel,
      total: row.totalCount,
    })),
    [
      {
        name: 'Unit01 名詞A',
        depth: 0,
        path: 'N2語彙トレーニング / Unit01 名詞A',
        total: 100,
      },
    ],
  )
})

test('wordbook filters expose each series before its leaf word lists', () => {
  const options = listWordbookFilterOptions([
    {
      id: 'n1',
      name: 'N1',
      seriesId: 'red-book',
      seriesName: '红宝书',
      count: 3053,
    },
    {
      id: 'n2',
      name: 'N2',
      seriesId: 'red-book',
      seriesName: '红宝书',
      count: 2328,
    },
  ])

  assert.deepEqual(options, [
    {
      value: 'series:red-book',
      label: '红宝书',
      selectedLabel: '红宝书',
      depth: 0,
      meta: '2 个词表',
    },
    {
      value: 'n1',
      label: 'N1',
      selectedLabel: '红宝书 / N1',
      depth: 1,
      count: 3053,
    },
    {
      value: 'n2',
      label: 'N2',
      selectedLabel: '红宝书 / N2',
      depth: 1,
      count: 2328,
    },
  ])
})

test('wordbook filter values distinguish all, uncollected, series and leaf scopes', () => {
  assert.deepEqual(parseWordbookFilter('all'), { kind: 'all' })
  assert.deepEqual(parseWordbookFilter('none'), { kind: 'none' })
  assert.deepEqual(parseWordbookFilter('series:red-book'), {
    kind: 'series',
    id: 'red-book',
  })
  assert.deepEqual(parseWordbookFilter('n2'), { kind: 'wordbook', id: 'n2' })
})

test('selecting a wordbook series filters through every child word list', () => {
  assert.deepEqual(vocabularyPageWhere({ wordbookFilter: 'series:series-id', seriesFilter: 'series-id', tagFilter: 'all', keyword: '' }).AND[0], { wordbooks: { some: { wordbook: { seriesId: 'series-id' } } } })
})

test('more sentence search filters candidates in storage and shows paper sources', async () => {
  const [actions, panel] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/actions.ts'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/SentenceSearchPanel.tsx',
      ),
      'utf8',
    ),
  ])

  assert.match(actions, /buildJapaneseVocabularySearchTerms/)
  assert.match(actions, /string_contains: term/)
  assert.match(actions, /Prisma\.join\(questionTextConditions/)
  assert.match(actions, /LIMIT 48/)
  assert.match(actions, /collectionType: CollectionType\.PAPER/)
  assert.match(actions, /`试卷：\$\{paper\.title\}`/)
  assert.match(actions, /`\/practice\/\$\{paper\.id\}`/)
  assert.match(panel, /href=\{sentence\.sourceUrl\}/)
  assert.match(panel, /\{sourceLabel\}/)
})

test('vocabulary pages keep bounded rows and show the filtered total', async () => {
  const [page, tabs, wordbookPage] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/vocabulary/wordbooks/[id]/page.tsx'),
      'utf8',
    ),
  ])

  assert.match(page, /const PAGE_SIZE = 30/)
  assert.match(tabs, /pageSize = 30/)
  assert.match(tabs, /共 \{effectiveGroupTotal\} 条/)
  assert.doesNotMatch(tabs, /本页 \{visibleList\.length\} 条/)
  assert.match(wordbookPage, /const PAGE_SIZE = 50/)
})

test('wordbook removal deletes only membership data and keeps vocabulary records', async () => {
  const [actions, detail] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/wordbooks/actions.ts'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/WordbookDetailClient.tsx',
      ),
      'utf8',
    ),
  ])

  assert.match(actions, /tx\.wordbookVocabulary\.deleteMany/)
  assert.match(actions, /prisma\.wordbookVocabulary\.deleteMany/)
  assert.doesNotMatch(actions, /(?:tx|prisma)\.vocabulary\.delete/)
  assert.match(detail, /单词本身及其在其他词表中的内容都会保留/)
  assert.match(detail, /<CustomSelect/)
  assert.doesNotMatch(detail, /输入序号选择目标/)
})

test('part-of-speech hierarchy and wordbook batch tags stay user scoped', async () => {
  const [schema, adminActions, wordbookActions, detail] = await Promise.all([
    readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8'),
    readFile(path.join(ROOT, 'modules/knowledge/vocabulary/admin-actions.ts'), 'utf8'),
    readFile(path.join(ROOT, 'modules/knowledge/wordbooks/actions.ts'), 'utf8'),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/WordbookDetailClient.tsx',
      ),
      'utf8',
    ),
  ])

  assert.match(schema, /model VocabularyPartOfSpeech/)
  assert.match(schema, /languageCode\s+String/)
  assert.match(schema, /parentId\s+String\?/)
  assert.match(adminActions, /userId_languageCode_name:/)
  assert.match(adminActions, /resolveVocabularyLanguageCode/)
  assert.match(adminActions, /parseJsonStringList\(item\.partsOfSpeech\)/)
  assert.match(wordbookActions, /addTagsToWordbookVocabularies/)
  assert.match(wordbookActions, /some: \{ wordbookId: trimmedWordbookId, wordbook: \{ userId \} \}/)
  assert.match(detail, /批量添加标签/)
})

test('vocabulary tag filters stay in the server-paginated URL flow', async () => {
  const [page, tabs, repository] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/server/repository.ts'),
      'utf8',
    ),
  ])

  assert.match(page, /resolvedSearchParams\.tag/)
  assert.deepEqual(vocabularyPageWhere({ wordbookFilter: 'all', seriesFilter: '', tagFilter: 'selected-tag', keyword: '' }).AND[1], { tags: { some: { tag: { name: 'selected-tag' } } } })
  assert.match(repository, /listVocabularyTagOptions/)
  assert.match(tabs, /ariaLabel='按标签筛选'/)
  assert.match(tabs, /params\.set\('tag', nextTag\)/)
})
