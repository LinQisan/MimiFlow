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

test('selecting a wordbook series filters through every child word list', async () => {
  const page = await readFile(
    path.join(ROOT, 'app/vocabulary/page.tsx'),
    'utf8',
  )

  assert.match(page, /wordbookFilter\.startsWith\('series:'\)/)
  assert.deepEqual(vocabularyPageWhere({ wordbookFilter: 'series:series-id', seriesFilter: 'series-id', tagFilter: 'all', keyword: '' }).AND[0], { wordbooks: { some: { wordbook: { seriesId: 'series-id' } } } })
})

test('wordbook navigation preserves series order', async () => {
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
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
  ])

  assert.doesNotMatch(repository, /startsWith: 'legacy-'/)
  assert.match(repository, /_count: \{ select: \{ entries: true \} \}/)
  assert.match(dropdown, /option\.depth/)
  assert.match(dropdown, /option\.count/)
  assert.match(vocabularyTabs, /listWordbooks/)
})

test('duplicate headwords share one page with ordered wordbook content', async () => {
  const [page, repository, tabs, types] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/server/repository.ts'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/types.ts'),
      'utf8',
    ),
  ])

  assert.match(page, /vocabularyWordKey/)
  assert.match(page, /listVocabularyDetailsByWords/)
  assert.match(page, /listVocabularyListDetailsByWords/)
  assert.match(page, /includeCardDetails/)
  assert.match(page, /hasVocabularyCardDetails/)
  assert.match(page, /sentenceLinks = includeCardDetails/)
  assert.match(page, /getVocabularySeriesPriority/)
  assert.match(page, /wordbookFilter === wordbookId/)
  assert.match(page, /wordbookSources/)
  assert.match(repository, /listVocabularyDetailsByWords/)
  assert.match(repository, /listVocabularyListDetailsByWords/)
  assert.match(repository, /VOCABULARY_LIST_DETAIL_SELECT/)
  const membershipLinks = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/components/WordbookMembershipLinks.tsx'),
    'utf8',
  )
  assert.match(tabs, /<WordbookMembershipLinks/)
  assert.match(membershipLinks, /\/vocabulary\/wordbooks\/\$\{wordbook\.id\}/)
  assert.match(membershipLinks, /formatPath\(wordbook\.pathLabel/)
  assert.match(types, /VocabularyWordbookSource/)
})

test('the list-to-card transition fetches the card payload through the router', async () => {
  const tabs = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.match(tabs, /const openVocabularyCard = \(vocabularyId: string\)/)
  assert.match(tabs, /buildVocabularyViewHref\([\s\S]*?'card',[\s\S]*?vocabularyId/)
  assert.match(tabs, /openVocabularyCard\(vocab\.id\)/)
  const viewNavigation = tabs.slice(
    tabs.indexOf("const setVocabularyViewMode"),
    tabs.indexOf("useEffect(() => {\n    setViewMode(searchParams"),
  )
  assert.match(viewNavigation, /router\.push\(href\)/)
  assert.doesNotMatch(viewNavigation, /window\.history\.replaceState/)
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

test('vocabulary uses the same automatic pronunciation flow as reading and practice', async () => {
  const [tabs, pronunciationHook, sharedHook, word, sentence] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/hooks/useVocabularyPronunciation.ts',
      ),
      'utf8',
    ),
    readFile(path.join(ROOT, 'modules/language/hooks/usePronunciationSource.ts'), 'utf8'),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/WordPronunciation.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/VocabularySentenceText.tsx',
      ),
      'utf8',
    ),
  ])

  assert.match(tabs, /PronunciationSourceSelector/)
  assert.match(tabs, /useVocabularyPronunciation/)
  // The vocabulary hook delegates preference state to the shared hook, which
  // owns the single storage key; the fetch flow itself stays local.
  assert.match(pronunciationHook, /usePronunciationSource/)
  assert.match(sharedHook, /PRONUNCIATION_SOURCE_STORAGE_KEY/)
  assert.match(pronunciationHook, /fetch\('\/api\/pronunciation\/batch'/)
  assert.match(
    pronunciationHook,
    /vocabularyIds: missingVocabIds/,
  )
  assert.match(word, /annotateJapaneseTextWithSudachi\(word/)
  assert.match(sentence, /annotateJapaneseTextWithSudachi\(value/)
  assert.match(sentence, /useSudachiReading: true/)
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

test('word-only wordbooks do not render empty content cards', async () => {
  const tabs = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.match(tabs, /const contentSources = separatedSources\.filter/)
  assert.match(tabs, /contentSources\.length > 0/)
  assert.match(tabs, /contentSources\.map/)
  assert.doesNotMatch(tabs, /该单词收录于此单词书，当前提供读音与词性信息/)
  assert.match(tabs, />\s*匹配词形\s*</)
})

test('flashcards center multi-headword vocabulary as one visual group', async () => {
  const [tabs, pronunciation] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/WordPronunciation.tsx'),
      'utf8',
    ),
  ])

  assert.match(tabs, /variantGroupClassName='justify-center'/)
  assert.match(pronunciation, /variantGroupClassName/)
  assert.match(pronunciation, /flex flex-wrap items-end/)
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

test('vocabulary detail editing keeps one shared inline layout', async () => {
  const [tabs, editor, actions] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/VocabularyEntryEditor.tsx',
      ),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/entry-actions.ts'),
      'utf8',
    ),
  ])

  assert.match(tabs, /useVocabularyInlineEditor/)
  assert.match(tabs, /<VocabularyDefinitions/)
  assert.match(tabs, /<VocabularySenseDetails/)
  assert.match(tabs, /<VocabularyRelationDetails/)
  assert.match(editor, /VocabularyInlineEditToolbar/)
  assert.match(editor, /function toVocabularyEntryDraft/)
  assert.match(actions, /saveVocabularyEntryDraft/)
  assert.doesNotMatch(tabs, /VocabularyMeaningEditor/)
})

test('vocabulary management shows wordbook provenance instead of import placeholder source', async () => {
  const [page, adminActions] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyManageClient.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/admin-actions.ts'),
      'utf8',
    ),
  ])

  assert.match(adminActions, /wordbookPaths:/)
  assert.match(adminActions, /link\.wordbook\.series\.title/)
  assert.match(page, /item\.wordbookPaths\.length > 0/)
  assert.doesNotMatch(page, /ARTICLE_TEXT: '阅读'/)
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

test('vocabulary starts audio in the click path and handles browser playback policy', async () => {
  const tabs = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.doesNotMatch(tabs, /audioPlaybackQueueRef/)
  assert.doesNotMatch(tabs, /await audio\.play\(\)/)
  assert.match(tabs, /const playback = audio\.play\(\)/)
  assert.match(tabs, /NotAllowedError/)
  assert.match(tabs, /NotSupportedError/)
  assert.match(tabs, /loadedmetadata/)
  assert.match(tabs, /audio\.setAttribute\('playsinline', ''\)/)
  assert.match(tabs, /requestId !== audioRequestIdRef\.current/)
  assert.match(tabs, /errorName === 'AbortError'/)
})

test('vocabulary toolbar keeps responsive layout SSR-deterministic', async () => {
  const [tabs, toolbar, layout] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyPageToolbar.tsx'),
      'utf8',
    ),
    readFile(path.join(ROOT, 'app/layout.tsx'), 'utf8'),
  ])

  assert.doesNotMatch(tabs, /window\.innerWidth|window\.matchMedia|typeof window/)
  assert.match(tabs, /aria-label='显示设置'/)
  assert.match(tabs, /aria-label='学习方式'/)
  assert.match(toolbar, /aria-label='视图操作'/)
  assert.doesNotMatch(toolbar, /window\.innerWidth|window\.matchMedia|typeof window/)
  assert.doesNotMatch(layout, /suppressHydrationWarning/)
})
