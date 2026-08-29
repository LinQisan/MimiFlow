import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const SOURCE_DIRS = ['app', 'components', 'features', 'hooks', 'lib', 'modules', 'utils']

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
    'app/(admin)/manage/listening/page.tsx',
    'app/(admin)/manage/shadowing/page.tsx',
    'app/(admin)/manage/reading/page.tsx',
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
    'lib/actions/result.ts',
    'lib/errors/domain-error.ts',
    'lib/validation/schema.ts',
    'lib/codecs/material-payload.ts',
    'lib/codecs/question-content.ts',
    'features/collections/ui/DndSystem.tsx',
    'features/content/ui/EditArticleUI.tsx',
    'features/content/ui/EditQuizUI.tsx',
    'features/import/ui/UploadCenterUI.tsx',
    'features/import/hooks/useUploadMutations.ts',
    'features/listening/ui/ListeningListClient.tsx',
    'features/listening/ui/ListeningViewSwitcher.tsx',
    'features/listening/hooks/useListeningListQuery.ts',
    'features/listening/hooks/useListeningListState.ts',
    'features/listening/hooks/useListeningListMutations.ts',
    'features/practice/ui/PaperQuestionEditor.tsx',
    'features/practice/ui/PaperLibraryItem.tsx',
    'features/practice/domain/paper-library.ts',
    'features/practice/hooks/usePaperLibraryState.ts',
    'features/questions/domain/editor.ts',
    'features/questions/domain/paper-editor.ts',
    'features/questions/components/QuestionTypeBadge.tsx',
    'features/questions/hooks/useQuestionEditorMutations.ts',
    'features/questions/hooks/useQuestionEditorPageState.ts',
    'features/questions/hooks/useQuestionListEditorState.ts',
    'features/questions/hooks/usePaperQuestionEditorState.ts',
    'features/reading/ui/ArticleReaderClient.tsx',
    'modules/knowledge/vocabulary/hooks/useVocabularyMutations.ts',
    'modules/knowledge/vocabulary/hooks/useVocabularyWorkspaceState.ts',
    'modules/media-subtitles/domain/editor.ts',
    'modules/media-subtitles/components/HighlightedSubtitleText.tsx',
    'modules/media-subtitles/hooks/useMediaSubtitleEditorState.ts',
    'modules/media-subtitles/hooks/useMediaSubtitleMutations.ts',
  ]

  for (const file of required) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true)
  }
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

test('review workflows preserve submitted state and keep clear exits', async () => {
  const questionReview = await readFile(
    path.join(ROOT, 'app/(study)/review/[id]/ReviewQuestionClient.tsx'),
    'utf8',
  )
  const memoryReview = await readFile(
    path.join(ROOT, 'app/(study)/review/memory/MemoryReviewClient.tsx'),
    'utf8',
  )
  const mistakeActions = await readFile(
    path.join(ROOT, 'modules/review/actions/mistakes.ts'),
    'utf8',
  )
  const questionRenderer = await readFile(
    path.join(ROOT, 'components/exam/QuestionRenderer.tsx'),
    'utf8',
  )
  assert.match(
    questionReview,
    /if \(item\.retryId === currentItems\[0\]\?\.retryId\) return/,
  )
  assert.match(questionReview, /href='\/review'/)
  assert.match(questionReview, /href=\{item\.sourceUrl\}/)
  assert.match(questionReview, /disabled=\{!allAnswered \|\| isPending\}/)
  assert.match(questionReview, /submitRetryAnswers/)
  assert.match(questionReview, /同一听力材料/)
  assert.match(questionReview, /aria-label='选择复习题型'/)
  assert.match(questionReview, /activeTypeQuery/)
  assert.match(mistakeActions, /getDueRetryQuestionTypeSummaries/)
  assert.equal(questionReview.includes('优化后正确率'), false)
  assert.equal(questionReview.includes('满足条件后可轻度清理'), false)
  assert.equal(questionRenderer.includes('作答面板'), false)
  assert.match(memoryReview, />\s*\u8fd4\u56de\u590d\u4e60\u4e2d\u5fc3\s*</)
  assert.match(mistakeActions, /\/do\?qid=/)
})

test('large feature entry points delegate distinct responsibilities', async () => {
  const vocabularyActions = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/actions.ts'),
    'utf8',
  )
  const uploadCenter = await readFile(
    path.join(ROOT, 'features/import/ui/UploadCenterUI.tsx'),
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

test('large interactive editors keep state, mutations, domain logic, and views separated', async () => {
  const entries = [
    ['app/(knowledge)/vocabulary/VocabularyTabs.tsx', [
      /useVocabularyWorkspaceState/,
      /useVocabularyMutations/,
      /vocabulary\/domain\/workbench/,
      /vocabulary\/components\//,
    ]],
    ['features/import/ui/UploadForm.tsx', [
      /useAudioUploadState/,
      /useUploadFormMutations/,
      /import\/audio\/domain/,
      /AudioMatchPreview/,
    ]],
    ['features/import/ui/UploadCenterUI.tsx', [
      /useUploadCenterState/,
      /useUploadCenterMutations/,
      /article-question-builder/,
      /ArticleImportPanel/,
    ]],
    ['app/(library)/subtitles/[id]/MediaSubtitleEditor.tsx', [
      /useMediaSubtitleEditorState/,
      /useMediaSubtitleMutations/,
      /media-subtitles\/domain\/editor/,
      /HighlightedSubtitleText/,
    ]],
    ['features/listening/ui/ListeningListClient.tsx', [
      /useListeningListQuery/,
      /useListeningListState/,
      /useListeningListMutations/,
      /ListeningQuickClassifyForm/,
    ]],
    ['features/content/ui/EditQuizUI.tsx', [
      /useQuestionListEditorState/,
      /useQuestionEditorMutations/,
      /questions\/domain\/editor/,
      /QuestionTypeBadge/,
    ]],
    ['features/collections/ui/LessonQuestionsPanel.tsx', [
      /useLessonQuestionPageState/,
      /useQuestionEditorMutations/,
      /questions\/domain\/editor/,
      /QuestionTypeBadge/,
    ]],
    ['features/practice/ui/PaperQuestionEditor.tsx', [
      /usePaperQuestionEditorState/,
      /useQuestionEditorMutations/,
      /questions\/domain\/paper-editor/,
      /CustomSelect/,
    ]],
  ]

  for (const [file, boundaries] of entries) {
    const content = await readFile(path.join(ROOT, file), 'utf8')
    assert.equal(content.includes('useState'), false, `${file} keeps local useState`)
    for (const boundary of boundaries) assert.match(content, boundary)
  }
})

test('content import keeps one task visible at a time', async () => {
  const importPage = await readFile(
    path.join(ROOT, 'app/(admin)/manage/import/page.tsx'),
    'utf8',
  )
  const importNavigation = await readFile(
    path.join(ROOT, 'app/(admin)/manage/import/ImportNavigation.tsx'),
    'utf8',
  )
  const uploadCenter = await readFile(
    path.join(ROOT, 'features/import/ui/UploadCenterUI.tsx'),
    'utf8',
  )
  const uploadForm = await readFile(
    path.join(ROOT, 'features/import/ui/UploadForm.tsx'),
    'utf8',
  )
  const listeningQuestionEditor = await readFile(
    path.join(ROOT, 'features/collections/ui/LessonQuestionsPanel.tsx'),
    'utf8',
  )
  const importActions = await readFile(
    path.join(ROOT, 'features/import/actions.ts'),
    'utf8',
  )
  const questionRenderer = await readFile(
    path.join(ROOT, 'components/exam/QuestionRenderer.tsx'),
    'utf8',
  )
  const optionsList = await readFile(
    path.join(ROOT, 'components/exam/question-renderer/OptionsList.tsx'),
    'utf8',
  )
  const toeicTypes = await readFile(
    path.join(ROOT, 'features/questions/domain/toeic.ts'),
    'utf8',
  )
  const answerCardSections = await readFile(
    path.join(ROOT, 'modules/practice/domain/answer-card-sections.ts'),
    'utf8',
  )
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')

  assert.match(importPage, /ImportNavigation/)
  assert.match(importNavigation, /选择导入语言/)
  assert.match(importNavigation, /选择导入分类/)
  assert.match(importNavigation, /选择导入类型/)
  assert.match(importNavigation, /CustomSelect/)
  assert.match(importPage, /label: '试卷'/)
  assert.match(importPage, /label: '学习材料'/)
  assert.match(importPage, /文字·词汇·语法/)
  assert.match(importPage, /TOEIC_PARTS/)
  assert.match(importPage, /label: '听力题'/)
  assert.match(importPage, /label: '阅读题'/)
  assert.match(importPage, /label: language === 'ja' \? '文字·词汇·语法' : '文法题'/)
  assert.match(importPage, /aria-label='选择 TOEIC Part'/)
  assert.match(importPage, /part=\$\{part\.part\}/)
  assert.match(importPage, /legacyToeicPart/)
  assert.match(importPage, /collectionTypesByScope/)
  assert.match(uploadCenter, /collectionScope/)
  assert.match(uploadForm, /name='collectionLanguage'/)
  assert.equal(uploadCenter.includes('Step 2-4'), false)
  assert.match(uploadCenter, /handleBulkQuickParse/)
  assert.match(uploadCenter, /粘贴一题或多题后自动识别并进入校对/)
  assert.match(importPage, /speaking: 'audio'/)
  assert.equal(uploadCenter.includes('AudioTimingStudio'), false)
  assert.equal(uploadCenter.includes('补充语言与等级'), false)
  assert.equal(uploadForm.includes('补充来源、难度与检索信息'), false)
  assert.match(uploadForm, /字幕语言/)
  assert.match(uploadForm, /章节名称/)
  assert.match(uploadForm, /const resolvedType = defaultMaterialType/)
  assert.match(uploadForm, /usesAutomaticListeningTitle/)
  assert.match(uploadForm, /无需填写标题。系统会优先识别文件名中的問題编号/)
  assert.equal(uploadForm.includes('paper.materialType === materialType'), false)
  assert.match(uploadForm, /name='collectionIds'/)
  assert.equal(uploadForm.includes('扩展材料属性（可选）'), false)
  assert.match(schema, /TOEIC_PHOTOGRAPH/)
  assert.match(listeningQuestionEditor, /listeningQuestionImage_/)
  assert.match(listeningQuestionEditor, /Part 1 · Photographs/)
  assert.match(listeningQuestionEditor, /event\.clipboardData\.items/)
  assert.match(listeningQuestionEditor, /已读取剪贴板图片/)
  assert.match(listeningQuestionEditor, /图片选项/)
  assert.match(listeningQuestionEditor, /listeningQuestionOptionImage_/)
  assert.equal(/分割线|自动切割|自动裁切/.test(listeningQuestionEditor), false)
  assert.equal(
    listeningQuestionEditor.includes(
      "<ActionInterceptor className='space-y-5 p-4 md:p-5'>",
    ),
    false,
  )
  assert.match(uploadForm, /collectionScope/)
  assert.match(uploadForm, /所属试卷/)
  assert.match(uploadForm, /新建试卷/)
  assert.match(importActions, /saveUploadedQuestionImage/)
  assert.match(importActions, /toSafeFilename\(questionTitle\)/)
  assert.match(importActions, /-option-/)
  assert.match(questionRenderer, /\{item\.imageUrl \? \(/)
  assert.match(optionsList, /option\.imageUrl/)
  assert.match(optionsList, /grid-cols-2 gap-3 md:grid-cols-4/)
  for (const title of [
    'Photographs',
    'Question-Response',
    'Conversations',
    'Talks',
    'Incomplete Sentences',
    'Text Completion',
    'Reading Comprehension',
  ]) {
    assert.match(toeicTypes, new RegExp(title))
  }
  assert.match(answerCardSections, /getToeicPartByQuestionType/)
})

test('content import loads the audio catalogue on demand without effect loops', async () => {
  const uploadState = await readFile(
    path.join(ROOT, 'modules/import/audio/hooks/useAudioUploadState.ts'),
    'utf8',
  )
  const audioCatalogue = await readFile(
    path.join(ROOT, 'modules/import/audio/hooks/useAudioFileCatalog.ts'),
    'utf8',
  )
  const uploadForm = await readFile(
    path.join(ROOT, 'features/import/ui/UploadForm.tsx'),
    'utf8',
  )

  assert.match(uploadState, /const setters = useMemo/)
  assert.match(audioCatalogue, /if \(!enabled \|\| existingAudioFiles\.length > 0\) return/)
  assert.match(uploadForm, /enabled: audioSourceType === 'existing'/)
})

test('content import filters collections by explicit material capabilities', async () => {
  const schema = await readFile(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
  const repository = await readFile(
    path.join(ROOT, 'lib/repositories/manage/index.ts'),
    'utf8',
  )
  const importPage = await readFile(
    path.join(ROOT, 'app/(admin)/manage/import/page.tsx'),
    'utf8',
  )
  assert.match(schema, /provider = "postgresql"/)
  assert.match(schema, /acceptedMaterialTypes MaterialType\[\]/)
  assert.match(repository, /acceptedMaterialTypes: \{ has: materialType \}/)
  assert.match(importPage, /reading: 'READING'/)
})

test('management pages keep classification, exams, and audio responsibilities separate', async () => {
  const shadowingLibraryManager = await readFile(
    path.join(ROOT, 'features/listening/ui/ShadowingLibraryManager.tsx'),
    'utf8',
  )
  const practicePage = await readFile(
    path.join(ROOT, 'features/practice/ui/ManagePapersListClient.tsx'),
    'utf8',
  )
  const listeningPage = await readFile(
    path.join(ROOT, 'features/listening/ui/ListeningListClient.tsx'),
    'utf8',
  )
  const examRepository = await readFile(
    path.join(ROOT, 'lib/repositories/exam/index.ts'),
    'utf8',
  )
  const listeningEditor = await readFile(
    path.join(ROOT, 'app/(admin)/manage/listening/[id]/page.tsx'),
    'utf8',
  )
  const listeningQuestionEditor = await readFile(
    path.join(
      ROOT,
      'features/collections/ui/LessonQuestionsPanel.tsx',
    ),
    'utf8',
  )
  const paperQuestionEditor = await readFile(
    path.join(
      ROOT,
      'features/practice/ui/PaperQuestionEditor.tsx',
    ),
    'utf8',
  )
  const paperQuestionActions = await readFile(
    path.join(ROOT, 'features/practice/admin-actions.ts'),
    'utf8',
  )

  assert.match(shadowingLibraryManager, /教材与章节/)
  assert.match(shadowingLibraryManager, /createShadowingChapter/)
  assert.match(shadowingLibraryManager, /updateCollectionAttributes/)
  assert.match(shadowingLibraryManager, /deleteCollection/)
  assert.match(examRepository, /collectionType: CollectionType\.PAPER/)
  assert.equal(practicePage.includes('FavoriteCollectionCreateForm'), false)
  assert.equal(practicePage.includes('全部类型'), false)
  assert.doesNotMatch(practicePage, /Official papers|查看练习页|预览|作答|元信息/)
  assert.match(practicePage, /导入题目/)
  assert.match(practicePage, /设置/)
  assert.match(listeningPage, /听力材料/)
  assert.match(listeningPage, /跟读材料/)
  assert.match(listeningPage, /ShadowingLibraryManager/)
  assert.match(listeningPage, /添加题目/)
  assert.match(
    listeningPage,
    /`\/manage\/listening\/\$\{item\.id\}\?returnPage=\$\{normalizedManagePage\}#questions`/,
  )
  assert.match(listeningPage, /`\/manage\/shadowing\/\$\{item\.id\}`/)
  assert.equal(listeningPage.includes('groupedByChapterRows'), false)
  assert.match(listeningEditor, /getListeningEditData/)
  assert.equal(listeningEditor.includes('getSpeakingEditData'), false)
  assert.match(listeningEditor, /LessonQuestionsPanel/)
  assert.match(listeningQuestionEditor, /aria-label='材料所属問題'/)
  assert.equal(listeningQuestionEditor.includes('所属問題（1、2、3…）'), false)
  assert.match(paperQuestionEditor, /getQuestionTypeLabel/)
  assert.doesNotMatch(
    paperQuestionEditor,
    /Paper editor|预览试卷|测试作答|按材料检查|InfoTile/,
  )
  assert.match(paperQuestionEditor, /placeholder='搜索题目'/)
  assert.match(paperQuestionEditor, /\{isSaving \? '保存中…' : '保存题目'\}/)
  assert.match(paperQuestionEditor, /题目内容/)
  assert.match(paperQuestionEditor, /选项与答案/)
  assert.match(paperQuestionEditor, /getVocabGrammarQuestionSection/)
  assert.match(paperQuestionEditor, /問題\$\{vocabGrammarNumber\.sectionNumber\}/)
  assert.match(paperQuestionEditor, /aria-label='题目分区'/)
  assert.match(paperQuestionEditor, /fixed inset-x-0 bottom-0/)
  assert.match(paperQuestionEditor, /paper-question-row/)
  assert.match(paperQuestionEditor, /全选 \{visibleQuestionCount\}/)
  assert.match(paperQuestionEditor, /移动到其他试卷/)
  assert.match(paperQuestionEditor, /handleDeleteSelected/)
  assert.match(paperQuestionActions, /deletePaperQuestions/)
  assert.match(paperQuestionActions, /movePaperQuestions/)
  assert.match(paperQuestionActions, /resequenceMaterialQuestions/)
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
    path.join(ROOT, 'hooks/usePracticeSession.ts'),
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
