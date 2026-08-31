import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  listWordbooks,
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

test('active wordbook navigation hides legacy archive and preserves series order', async () => {
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
  const [tabs, pronunciationHook, word, sentence] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/hooks/useVocabularyPronunciation.ts',
      ),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'components/vocabulary/WordPronunciation.tsx'),
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
  assert.match(pronunciationHook, /PRONUNCIATION_SOURCE_STORAGE_KEY/)
  assert.match(pronunciationHook, /fetch\('\/api\/pronunciation'/)
  assert.match(
    pronunciationHook,
    /body: JSON\.stringify\(\{ texts: pronunciationTexts \}\)/,
  )
  assert.match(word, /annotateJapaneseTextWithSudachi\(word/)
  assert.match(sentence, /annotateJapaneseTextWithSudachi\(value/)
  assert.match(sentence, /useSudachiReading: true/)
})

test('vocabulary pages use fifty rows and show the filtered total', async () => {
  const [page, tabs, wordbookPage] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/wordbooks/[id]/page.tsx'),
      'utf8',
    ),
  ])

  assert.match(page, /const PAGE_SIZE = 50/)
  assert.match(tabs, /pageSize = 50/)
  assert.match(tabs, /共 \{effectiveGroupTotal\} 条/)
  assert.doesNotMatch(tabs, /本页 \{visibleList\.length\} 条/)
  assert.match(wordbookPage, /const PAGE_SIZE = 50/)
})

test('word-only wordbooks do not render empty content cards', async () => {
  const tabs = await readFile(
    path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.match(tabs, /const contentSources = separatedSources\.filter/)
  assert.match(tabs, /contentSources\.length > 0/)
  assert.match(tabs, /contentSources\.map/)
  assert.doesNotMatch(tabs, /该单词收录于此单词书，当前提供读音与词性信息/)
  assert.match(tabs, />\s*其他读音\s*</)
})

test('vocabulary management can save meanings to the selected wordbook record', async () => {
  const [page, tabs, meaningEditor, types, workspace, actions, mutations] = await Promise.all([
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/page.tsx'),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/components/VocabularyMeaningEditor.tsx',
      ),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/types.ts'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/hooks/useVocabularyWorkspaceState.ts',
      ),
      'utf8',
    ),
    readFile(
      path.join(ROOT, 'modules/knowledge/vocabulary/actions.ts'),
      'utf8',
    ),
    readFile(
      path.join(
        ROOT,
        'modules/knowledge/vocabulary/hooks/useVocabularyMutations.ts',
      ),
      'utf8',
    ),
  ])

  assert.match(page, /recordIds: \[\.\.\.source\.recordIds\]/)
  assert.match(types, /recordIds: string\[\]/)
  assert.match(workspace, /activeMeaningEditId/)
  assert.match(actions, /updateVocabularyMeaningsById/)
  assert.match(mutations, /updateVocabularyMeaningsById/)
  assert.match(tabs, /source\.recordIds\.includes\(target\.recordId\)/)
  assert.match(tabs, /<VocabularyMeaningEditor/)
  assert.match(meaningEditor, />\s*释义\s*</)
  assert.match(meaningEditor, /保存到 \{sourceLabel\}/)
})
