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
    '/manage/shadowing',
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

test('review routes and feature modules exist', async () => {
  const required = [
    'app/(study)/review/page.tsx',
    'app/(study)/review/memory/page.tsx',
    'app/(study)/review/mistakes/page.tsx',
    'app/(study)/listening/page.tsx',
    'app/(study)/listening/[id]/page.tsx',
    'app/(study)/practice/page.tsx',
    'app/(study)/practice/[id]/page.tsx',
    'app/(study)/practice/[id]/do/page.tsx',
    'app/(library)/subtitles/page.tsx',
    'app/(library)/subtitles/[id]/page.tsx',
    'app/(admin)/manage/import/page.tsx',
    'app/(admin)/manage/grammar/page.tsx',
    'app/(admin)/manage/system/page.tsx',
    'components/layout/StudyNavigation.tsx',
    'components/layout/ManageShell.tsx',
    'modules/review/actions/memory.ts',
    'modules/review/actions/mistakes.ts',
    'modules/review/server/mistake-repository.ts',
    'modules/review/server/queries.ts',
    'modules/progress/server/today-plan.ts',
    'modules/content/actions/materials.ts',
    'modules/practice/actions/questions.ts',
    'modules/import/domain/quiz-text-parser.ts',
    'modules/import/hooks/useUploadCenterState.ts',
    'modules/knowledge/vocabulary/domain/workbench.ts',
    'modules/knowledge/vocabulary/components/ControlDropdown.tsx',
    'modules/knowledge/vocabulary/actions.ts',
    'modules/knowledge/vocabulary/server/repository.ts',
    'modules/knowledge/wordbooks/actions.ts',
    'modules/import/audio/domain.ts',
    'modules/import/audio/hooks/useAudioUploadState.ts',
    'modules/import/audio/components/SearchableDropdown.tsx',
    'modules/import/audio/components/AudioMatchPreview.tsx',
    'modules/import/domain/article-question-builder.ts',
    'modules/import/components/ArticleImportPanel.tsx',
    'modules/import/components/BulkQuizPanel.tsx',
    'modules/knowledge/vocabulary/components/MemoryCardControls.tsx',
    'modules/knowledge/vocabulary/components/SentenceSearchPanel.tsx',
    'modules/knowledge/vocabulary/components/SentenceEditControls.tsx',
    'modules/knowledge/vocabulary/components/VocabularySentenceText.tsx',
    'modules/import/audio/hooks/useAudioFileCatalog.ts',
    'modules/media-subtitles/components/SubtitleReaderControls.tsx',
    'modules/practice/server/attempt-service.ts',
  ]

  for (const file of required) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true)
  }
})

test('large feature entry points delegate distinct responsibilities', async () => {
  const vocabularyActions = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/actions.ts'),
    'utf8',
  )
  const uploadCenter = await readFile(
    path.join(ROOT, 'app/(admin)/upload/UploadCenterUI.tsx'),
    'utf8',
  )
  const vocabularyTabs = await readFile(
    path.join(ROOT, 'app/(knowledge)/vocabulary/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.equal(
    vocabularyActions.includes('export async function createArticle'),
    false,
  )
  assert.equal(
    vocabularyActions.includes('export async function updateSortOrder'),
    false,
  )
  assert.match(uploadCenter, /modules\/import\/domain\/quiz-text-parser/)
  assert.match(uploadCenter, /modules\/import\/domain\/article-question-builder/)
  assert.match(uploadCenter, /modules\/import\/components\/ArticleImportPanel/)
  assert.match(uploadCenter, /modules\/import\/components\/BulkQuizPanel/)
  assert.match(vocabularyTabs, /vocabulary\/domain\/workbench/)
  assert.match(vocabularyTabs, /vocabulary\/components\/MemoryCardControls/)
  assert.match(vocabularyTabs, /vocabulary\/components\/SentenceSearchPanel/)
  assert.match(vocabularyTabs, /vocabulary\/components\/VocabularySentenceText/)
})

test('content import keeps one task visible at a time', async () => {
  const importPage = await readFile(
    path.join(ROOT, 'app/(admin)/manage/import/page.tsx'),
    'utf8',
  )
  const uploadCenter = await readFile(
    path.join(ROOT, 'app/(admin)/upload/UploadCenterUI.tsx'),
    'utf8',
  )
  const uploadForm = await readFile(
    path.join(ROOT, 'app/(admin)/upload/UploadForm.tsx'),
    'utf8',
  )

  assert.match(importPage, /练习内容/)
  assert.match(importPage, /学习资料/)
  assert.equal(uploadCenter.includes('Step 2-4'), false)
  assert.match(uploadCenter, /quizEntryMode === 'bulk'/)
  assert.match(uploadCenter, /题目录入方式/)
  assert.match(uploadForm, /补充来源、难度与检索信息/)
  assert.match(uploadForm, /const resolvedType: MaterialType = 'LISTENING'/)
  assert.match(uploadForm, /paper\.materialType === materialType/)
  assert.equal(uploadForm.includes('扩展材料属性（可选）'), false)
})

test('management pages keep classification, exams, and audio responsibilities separate', async () => {
  const collectionPage = await readFile(
    path.join(ROOT, 'app/(admin)/manage/collections/page.tsx'),
    'utf8',
  )
  const practicePage = await readFile(
    path.join(ROOT, 'app/(admin)/papers/manage/ManagePapersListClient.tsx'),
    'utf8',
  )
  const listeningPage = await readFile(
    path.join(ROOT, 'app/(study)/listening/ListeningListClient.tsx'),
    'utf8',
  )
  const examRepository = await readFile(
    path.join(ROOT, 'lib/repositories/exam/index.ts'),
    'utf8',
  )
  const collectionRepository = await readFile(
    path.join(ROOT, 'lib/repositories/collection/manage.ts'),
    'utf8',
  )

  assert.match(collectionPage, /编辑分类信息/)
  assert.match(collectionPage, /个子分类/)
  assert.match(examRepository, /collectionType: CollectionType\.PAPER/)
  assert.equal(practicePage.includes('FavoriteCollectionCreateForm'), false)
  assert.equal(practicePage.includes('全部类型'), false)
  assert.match(listeningPage, /音频材料/)
  assert.match(listeningPage, /管理书籍与章节/)
  assert.equal(listeningPage.includes('groupedByChapterRows'), false)
  assert.match(collectionRepository, /item\.type === MaterialType\.SPEAKING/)
})

test('schema keeps one vocabulary organization model and a typed question', async () => {
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
  assert.equal(schema.includes('model VocabularyFolder'), false)
  assert.equal(schema.includes('groupName'), false)
  assert.equal(schema.includes('model GameSessionLog'), false)
  assert.equal(schema.includes('model OutputPractice'), false)
  assert.match(schema, /questionType\s+QuestionType/)
  assert.match(schema, /model LearnerProfile/)
})
