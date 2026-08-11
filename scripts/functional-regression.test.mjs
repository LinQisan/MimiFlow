import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { evaluateSelectedOption } from '../modules/practice/domain/evaluate-attempt.ts'
import { summarizePracticeSubmission } from '../modules/practice/domain/submission-summary.ts'
import { normalizeQuestionDisplayText } from '../modules/practice/domain/question-text.ts'
import {
  annotateJapaneseText,
  escapeHtml,
} from '../utils/language/japaneseRuby.ts'
import { extractSentenceContainingSelection } from '../utils/text/sentenceContext.ts'
import {
  buildAudioDialogueSourceId,
  parseAudioDialogueSourceId,
} from '../utils/audioDialogue/sourceId.ts'
import { createTrustedMarkupSlots } from '../components/exam/question-renderer/trustedMarkup.ts'
import {
  formatJlptListeningFilename,
  formatJlptListeningTitle,
  parseJlptListeningIdentity,
} from '../utils/listening/jlptIdentity.ts'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '../utils/questions/optionLabels.ts'
import { getQuestionTypeLabel } from '../utils/questions/typeLabels.ts'
import { isReadingTitleDerivedFromContent } from '../lib/repositories/materials/material-title.ts'
import { parseArticleContentBlocks } from '../features/reading/domain/article-blocks.ts'
import {
  prepareEbookChapters,
  removeRepeatedEbookHeadings,
} from '../lib/ebooks/chapter-display.ts'
import { parsePastedBookText } from '../lib/ebooks/pasted-book.ts'
import { parseMultiQuizText } from '../modules/import/domain/quiz-text-parser.ts'
import {
  isPathInsideRoot,
  resolvePathInsideRoot,
} from '../utils/files/path.ts'
import {
  parseInput,
  readBoolean,
  readFiniteNumber,
  readJsonRecord,
  readString,
} from '../lib/validation/schema.ts'
import { z } from 'zod'
import { actionFailure, actionSuccess } from '../lib/actions/result.ts'
import { DomainError } from '../lib/errors/domain-error.ts'
import {
  getMaterialCollectionTypeError,
  isCollectionTypeAllowedForMaterial,
} from '../modules/import/collection-policy.ts'
import {
  decodeMaterialPayload,
  materialPayloadEnvelopeSchema,
} from '../lib/codecs/material-payload.ts'
import {
  decodeQuestionContent,
  encodeQuestionContent,
} from '../lib/codecs/question-content.ts'
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '../utils/questions/editorOptions.ts'

const ROOT = process.cwd()

test('question editors keep at least two options and preserve one correct answer', () => {
  const options = [
    { id: 'a', isCorrect: false },
    { id: 'b', isCorrect: true },
    { id: 'c', isCorrect: false },
  ]
  const afterCorrectRemoval = removeQuestionOptionAt(options, 1)
  assert.equal(afterCorrectRemoval.length, MIN_QUESTION_OPTION_COUNT)
  assert.equal(afterCorrectRemoval[0].isCorrect, true)
  assert.deepEqual(
    removeQuestionOptionAt(afterCorrectRemoval, 0),
    afterCorrectRemoval,
  )
})

test('question text import accepts a variable option count', () => {
  const [draft] = parseMultiQuizText(
    'どちらが自然ですか。\n1. はい\n2. いいえ\n3. わかりません',
  )
  assert.deepEqual(
    draft.options.map(option => option.text),
    ['はい', 'いいえ', 'わかりません'],
  )
})

test('untrusted values are normalized at data boundaries', () => {
  assert.deepEqual(readJsonRecord({ title: 'ok' }), { title: 'ok' })
  assert.deepEqual(readJsonRecord(['not', 'a', 'record']), {})
  assert.equal(readString(12), '')
  assert.equal(readBoolean('true'), false)
  assert.equal(readFiniteNumber('12.5'), 12.5)
  assert.equal(readFiniteNumber('invalid', 3), 3)
})

test('material payloads are discriminated by material type', () => {
  const reading = decodeMaterialPayload('READING', {
    text: '本文',
    dialogues: [{ text: 'wrong domain' }],
  })
  assert.equal(reading.text, '本文')
  assert.equal(reading.description, '')

  const listening = materialPayloadEnvelopeSchema.parse({
    type: 'LISTENING',
    payload: { dialogues: [{ text: '会話', start: 1, end: 2 }] },
  })
  assert.equal(listening.payload.dialogues[0].text, '会話')
  assert.deepEqual(listening.payload.tags, [])
})

test('question content stores extensions but never canonical question fields', () => {
  const encoded = encodeQuestionContent({
    prompt: 'duplicate',
    contextSentence: 'duplicate',
    explanation: 'duplicate',
    targetWord: '語彙',
    optionLabelFormat: 'numeric',
  })
  assert.deepEqual(encoded, {
    targetWord: '語彙',
    optionLabelFormat: 'numeric',
    customOptionLabels: [],
  })
  assert.equal(decodeQuestionContent(encoded).targetWord, '語彙')
})

test('server actions share a serializable result and domain error contract', () => {
  assert.deepEqual(actionSuccess({ id: 'saved' }, '已保存'), {
    success: true,
    message: '已保存',
    id: 'saved',
  })
  assert.deepEqual(
    actionFailure(new DomainError('NOT_FOUND', '内容不存在。')),
    {
      success: false,
      message: '内容不存在。',
      error: { code: 'NOT_FOUND', message: '内容不存在。' },
    },
  )
  assert.throws(
    () =>
      parseInput(
        z.object({ title: z.string().trim().min(1, '标题不能为空。') }),
        { title: '' },
      ),
    error => error instanceof DomainError && error.code === 'VALIDATION_ERROR',
  )
})

test('filesystem paths cannot escape the configured audio root', () => {
  const root = path.join(ROOT, 'public', 'audios')
  assert.equal(isPathInsideRoot(root, path.join(root, 'uploads', 'a.mp3')), true)
  assert.equal(isPathInsideRoot(root, path.join(ROOT, 'public', 'audios-copy')), false)
  assert.equal(resolvePathInsideRoot(root, '..', 'private.mp3'), null)
})

test('audio library keeps uploads organized and folders hierarchical', async () => {
  const action = await readFile(
    path.join(ROOT, 'features/audio/manage-actions.ts'),
    'utf8',
  )
  const page = await readFile(
    path.join(ROOT, 'app/(admin)/manage/system/audio/page.tsx'),
    'utf8',
  )

  assert.match(action, /return `uploads\/\$\{year\}-\$\{month\}`/)
  assert.match(action, /item\.folder\.startsWith\(`\$\{selectedFolder\}\//)
  assert.match(action, /walkAudioFolders/)
  assert.match(action, /replace\(\/\[\^\\p\{L\}\\p\{N\}/)
  assert.match(page, /folderSummaries\.map/)
  assert.match(page, /上传到目录/)
  assert.match(page, /待整理/)
})

test('material and collection compatibility is governed by one policy', () => {
  assert.equal(isCollectionTypeAllowedForMaterial('LISTENING', 'PAPER'), true)
  assert.equal(isCollectionTypeAllowedForMaterial('LISTENING', 'COURSE'), false)
  assert.equal(isCollectionTypeAllowedForMaterial('SPEAKING', 'PAPER'), false)
  assert.match(
    getMaterialCollectionTypeError('LISTENING', 'COURSE'),
    /听力材料目前只能加入正式试卷/,
  )
})

test('paper reading excerpts are not presented as real article titles', () => {
  assert.equal(
    isReadingTitleDerivedFromContent(
      '宅配クリーニング「ピース」ご利用案内',
      '宅配クリーニング「ピース」ご利用案内\n\nインターネットで注文して…',
    ),
    true,
  )
  assert.equal(
    isReadingTitleDerivedFromContent(
      '日本の働き方を考える',
      '近年、日本では働き方についての議論が続いている。',
    ),
    false,
  )
})

test('plain-text article tables become semantic reading blocks', () => {
  const blocks = parseArticleContentBlocks([
    '■ クリーニング基本料金\n　コート　　　　2,500円　　　セーター　　　800円\n　ジャケット　　1,300円　　　ワイシャツ　　400円',
    '■ お届けまでの日数\n　　　　　　16時までのご発送　　16時以降のご発送\n特別会員　　　　3日後　　　　　　　4日後\n普通会員　　　　6日後　　　　　　　7日後',
  ])

  assert.deepEqual(blocks[0], { type: 'text', text: '■ クリーニング基本料金' })
  assert.deepEqual(blocks[1], {
    type: 'table',
    hasHeader: false,
    rows: [
      ['コート', '2,500円', 'セーター', '800円'],
      ['ジャケット', '1,300円', 'ワイシャツ', '400円'],
    ],
  })
  assert.equal(blocks[3].type, 'table')
  assert.equal(blocks[3].hasHeader, true)
  assert.deepEqual(blocks[3].rows[0], ['', '16時までのご発送', '16時以降のご発送'])
})

test('professional books preserve chapters and mathematical notation', () => {
  const parsed = parsePastedBookText(
    '# 第一章 集合\n\n集合 $A$ を考える。\n\n$$\\sum_{i=1}^{n} i$$\n\n第2章　極限\n\n\\(x \\to 0\\) とする。',
    '解析学入門',
  )
  const blocks = parseArticleContentBlocks(
    parsed.chapters[0].text.split(/\n{2,}/),
  )

  assert.equal(parsed.chapterCount, 2)
  assert.equal(parsed.displayMathCount, 1)
  assert.equal(parsed.inlineMathCount, 2)
  assert.deepEqual(blocks[1], {
    type: 'math',
    expression: '\\sum_{i=1}^{n} i',
  })
})

test('listening quick entry accepts option-only lines separated by full-width spaces', () => {
  const parsed = parseMultiQuizText(
    '1　受信機の反応を良くする\n2　車の本体を軽くする\n3　タイヤを大きくする\n4　パワーの強いバッテリーに替える',
  )

  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].prompt, '')
  assert.deepEqual(
    parsed[0].options.map(option => option.text),
    [
      '受信機の反応を良くする',
      '車の本体を軽くする',
      'タイヤを大きくする',
      'パワーの強いバッテリーに替える',
    ],
  )
})

test('ebook navigation removes disposable pages and repairs repeated labels', () => {
  const chapters = prepareEbookChapters(
    [
      { id: 'cover', title: 'Cover', text: 'Cover', href: 'cover.xhtml' },
      { id: 'title', title: '本の名前', text: '本の名前', href: 'title.xhtml' },
      {
        id: 'one',
        title: '本の名前',
        text: '本の名前\n\n第一章\n\n長い本文がここから始まる。'.repeat(12),
        href: 'one.xhtml',
      },
      {
        id: 'two',
        title: '第二章',
        text: '第二章\n\n次の本文。',
        href: 'two.xhtml',
      },
      {
        id: 'three',
        title: '本の名前',
        text: '本の名前\n\n「碧さん、脱線！」\n\n本文。'.repeat(12),
        href: 'three.xhtml',
      },
    ],
    '本の名前',
  )
  assert.deepEqual(chapters.map(chapter => chapter.title), [
    '第一章',
    '第二章',
    '章节 03',
  ])
  assert.deepEqual(
    removeRepeatedEbookHeadings(
      ['本の名前', '第一章', '本文'],
      '本の名前',
      '第一章',
    ),
    ['本文'],
  )
})

test('JLPT listening filenames preserve exam, section, and question identity', () => {
  const legacy = parseJlptListeningIdentity('202507N1-02-06.mp3')
  assert.deepEqual(legacy, {
    level: 'N1',
    session: '2025-07',
    sectionNumber: 2,
    questionNumber: 6,
    sectionLabel: 'ポイント理解',
  })
  assert.equal(formatJlptListeningTitle(legacy), '問題2-06｜ポイント理解')
  assert.equal(
    formatJlptListeningFilename(legacy),
    '2025-07-N1-P02-Q06.mp3',
  )
  assert.equal(
    parseJlptListeningIdentity('問題1-03')?.sectionLabel,
    '課題理解',
  )
  assert.equal(parseJlptListeningIdentity('Shadowing-Unit01-03.mp3'), null)
})

test('Japanese option labels default to numeric and support custom sequences', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map(index => formatOptionLabel(index, 'numeric')),
    ['1', '2', '3', '4'],
  )
  assert.deepEqual(
    [0, 1, 2, 3].map(index => formatOptionLabel(index, 'katakana')),
    ['ア', 'イ', 'ウ', 'エ'],
  )
  const custom = parseCustomOptionLabels('Ⅰ|Ⅱ|Ⅲ|Ⅳ')
  assert.equal(formatOptionLabel(2, 'custom', custom), 'Ⅲ')
  assert.equal(normalizeOptionLabelFormat('unknown', 'numeric'), 'numeric')
})

test('stored question types use data-aware JLPT display names', () => {
  assert.equal(getQuestionTypeLabel('LISTENING'), '聴解')
  assert.equal(getQuestionTypeLabel('PRONUNCIATION'), '漢字読み')
  assert.equal(getQuestionTypeLabel('SYNONYM_REPLACEMENT'), '言い換え類義')
  assert.equal(getQuestionTypeLabel('WORD_DISTINCTION'), '用法')
  assert.equal(
    getQuestionTypeLabel('GRAMMAR'),
    '文脈規定／文法形式の判断',
  )
  assert.equal(getQuestionTypeLabel('FILL_BLANK'), '文章の文法')
  assert.equal(
    getQuestionTypeLabel('SORTING'),
    '文の文法2（文の組み立て）',
  )
  assert.equal(getQuestionTypeLabel('READING_COMPREHENSION'), '内容理解')
})

test('answer correctness is derived from stored options', () => {
  const options = [
    { id: 'option-a', isCorrect: false },
    { id: 'option-b', isCorrect: true },
  ]

  assert.deepEqual(evaluateSelectedOption(options, 'option-b'), {
    selectedOptionId: 'option-b',
    correctOptionId: 'option-b',
    isCorrect: true,
  })
  assert.equal(evaluateSelectedOption(options, 'option-a').isCorrect, false)
  assert.throws(
    () => evaluateSelectedOption(options, 'forged-option'),
    /所选答案无效/,
  )
})

test('partial practice submissions exclude unanswered questions', () => {
  const questions = [
    {
      id: 'q1',
      options: [
        { id: 'q1-a', isCorrect: true },
        { id: 'q1-b', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      options: [
        { id: 'q2-a', isCorrect: true },
        { id: 'q2-b', isCorrect: false },
      ],
    },
    {
      id: 'q3',
      options: [
        { id: 'q3-a', isCorrect: true },
        { id: 'q3-b', isCorrect: false },
      ],
    },
  ]

  assert.deepEqual(
    summarizePracticeSubmission(questions, {
      q1: 'q1-a',
      q2: 'q2-b',
    }),
    {
      submittedQuestionIds: ['q1', 'q2'],
      submittedCount: 2,
      gradableCount: 2,
      wrongIndexes: [1],
      wrongCount: 1,
      correctCount: 1,
      unansweredCount: 1,
    },
  )
})

test('internal empty question markers never reach practice UI', () => {
  assert.equal(normalizeQuestionDisplayText('（未填写语境句）'), null)
  assert.equal(normalizeQuestionDisplayText('**未填写语境句）'), null)
  assert.equal(normalizeQuestionDisplayText('暂无文字题干'), null)
  assert.equal(
    normalizeQuestionDisplayText('男の人は何を提出しますか。'),
    '男の人は何を提出しますか。',
  )
})

test('content writes use null instead of internal question placeholders', async () => {
  const contentActions = await readFile(
    path.join(ROOT, 'modules/content/actions/materials.ts'),
    'utf8',
  )
  const paperActions = await readFile(
    path.join(ROOT, 'features/practice/admin-actions.ts'),
    'utf8',
  )

  assert.equal(contentActions.includes('未填写语境句'), false)
  assert.equal(contentActions.includes('（听力题）'), false)
  assert.equal(paperActions.includes('未填写语境句'), false)
})

test('plain text and ruby fallbacks escape HTML', () => {
  const unsafe = '<img src=x onerror=alert(1)> & "quoted"'
  const escaped = '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'

  assert.equal(escapeHtml(unsafe), escaped)
  assert.equal(annotateJapaneseText(unsafe, {}), escaped)
  assert.equal(
    annotateJapaneseText('猫<script>alert(1)</script>', { 猫: 'ねこ' }),
    '<ruby>猫<rt aria-hidden="true" data-context-ignore="true">ねこ</rt></ruby>&lt;script&gt;alert(1)&lt;/script&gt;',
  )
})

test('reading blanks survive article escaping without trusting stored HTML', () => {
  const article = '最初は[1]、次は[2]。<img src=x onerror=alert(1)>'
  const slots = createTrustedMarkupSlots(article)
  const firstBlank = slots.add('<span class="article-blank-empty">(1)</span>')
  const secondBlank = slots.add('<span class="article-blank-empty">(2)</span>')
  const tokenized = article.replace('[1]', firstBlank).replace('[2]', secondBlank)
  const rendered = slots.restore(escapeHtml(tokenized))

  assert.equal(
    rendered,
    '最初は<span class="article-blank-empty">(1)</span>、次は<span class="article-blank-empty">(2)</span>。&lt;img src=x onerror=alert(1)&gt;',
  )
  assert.equal(rendered.includes('&lt;span'), false)
})

test('selection context follows the original surface and never stores an article fallback', () => {
  const article =
    '猫が窓辺で眠っている。犬は庭を走っている。鳥が空を飛んでいる。'

  assert.equal(
    extractSentenceContainingSelection(article, '走っている'),
    '犬は庭を走っている。',
  )
  assert.equal(
    extractSentenceContainingSelection(article, '走る'),
    '',
  )
  assert.equal(
    extractSentenceContainingSelection('窓辺で眠っている', '眠って'),
    '窓辺で眠っている',
  )
})

test('audio dialogue source ids are scoped by material', () => {
  const first = buildAudioDialogueSourceId('lesson-a', '1')
  const second = buildAudioDialogueSourceId('lesson-b', '1')

  assert.notEqual(first, second)
  assert.deepEqual(parseAudioDialogueSourceId(first), {
    materialId: 'lesson-a',
    stableId: '1',
  })
  assert.equal(parseAudioDialogueSourceId('1'), null)
})

test('management routes use one prefix and obsolete page routes are gone', async () => {
  const required = [
    'app/(admin)/manage/page.tsx',
    'app/(admin)/manage/import/page.tsx',
    'app/(admin)/manage/collections/page.tsx',
    'app/(admin)/manage/practice/page.tsx',
    'app/(admin)/manage/listening/page.tsx',
    'app/(admin)/manage/vocabulary/page.tsx',
    'app/(admin)/manage/grammar/page.tsx',
    'app/(admin)/manage/system/page.tsx',
    'app/(admin)/manage/system/audio/page.tsx',
    'app/(admin)/manage/system/review/page.tsx',
  ]
  const removed = [
    'app/(admin)/upload/page.tsx',
    'app/(admin)/papers/manage/page.tsx',
    'app/(study)/listening/manage/page.tsx',
    'app/(library)/collections/page.tsx',
    'app/(study)/exam/page.tsx',
    'app/(study)/shadowing/page.tsx',
    'app/(library)/media-subtitles/page.tsx',
    'app/(knowledge)/wordbooks/page.tsx',
    'app/(tools)/anki/page.tsx',
    'app/(tools)/settings/page.tsx',
    'app/(tools)/search/result/page.tsx',
  ]

  for (const file of required) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true)
  }
  for (const file of removed) {
    await assert.rejects(stat(path.join(ROOT, file)))
  }
})

test('review scheduling explains status before exposing diagnostics', async () => {
  const page = await readFile(
    path.join(ROOT, 'app/(admin)/manage/system/review/page.tsx'),
    'utf8',
  )

  assert.match(page, /等待复习数据/)
  assert.match(page, /目前不需要处理/)
  assert.match(page, /<details className=/)
  assert.match(page, /高级调度信息/)
  assert.match(page, /eventCount7d \? `\$\{data\.stats\.successRate7d\}%` : '—'/)
  assert.equal(page.includes("value={data.profile.lastEngineMode"), false)
})

test('route surfaces use the shared editorial visual language', async () => {
  const rootLayout = await readFile(path.join(ROOT, 'app/layout.tsx'), 'utf8')
  const globalStyles = await readFile(path.join(ROOT, 'app/globals.css'), 'utf8')
  const studyNavigation = await readFile(
    path.join(ROOT, 'components/layout/StudyNavigation.tsx'),
    'utf8',
  )
  const manageShell = await readFile(
    path.join(ROOT, 'components/layout/ManageShell.tsx'),
    'utf8',
  )
  const pageHeader = await readFile(
    path.join(ROOT, 'components/layout/PageHeader.tsx'),
    'utf8',
  )

  assert.match(rootLayout, /className='flat-ui editorial-ui'/)
  assert.match(globalStyles, /\.flat-ui main/)
  assert.match(globalStyles, /--font-editorial-display/)
  assert.match(globalStyles, /--editorial-paper: #f6f5f1/)
  assert.match(globalStyles, /--editorial-paper-raised: #ffffff/)
  assert.match(studyNavigation, /max-w-7xl/)
  assert.match(manageShell, /max-w-7xl/)
  assert.match(globalStyles, /body\.editorial-ui main h1/)
  assert.match(globalStyles, /main\[class\*='min-h-screen'\][\s\S]*padding-top: 0/)
  assert.equal(globalStyles.includes('padding-top: clamp(2.75rem'), false)
  assert.match(globalStyles, /--modern-radius-lg: 1rem/)
  assert.match(globalStyles, /border-radius: var\(--modern-radius-lg\) !important/)
  assert.match(globalStyles, /border-radius: var\(--modern-radius-sm\)/)
  assert.match(studyNavigation, /editorial-nav/)
  assert.match(manageShell, /editorial-nav/)
  assert.equal(studyNavigation.includes('border-b-2'), false)
  assert.equal(manageShell.includes('border-b-2'), false)
  assert.equal(pageHeader.includes('border-y border-slate-200'), false)
})

test('body copy uses language-aware sans-serif font stacks', async () => {
  const globalStyles = await readFile(path.join(ROOT, 'app/globals.css'), 'utf8')
  const managePage = await readFile(
    path.join(ROOT, 'app/(admin)/manage/page.tsx'),
    'utf8',
  )
  const reviewPage = await readFile(
    path.join(ROOT, 'app/(study)/review/page.tsx'),
    'utf8',
  )
  const articleReader = await readFile(
    path.join(
      ROOT,
      'features/reading/ui/ArticleReaderClient.tsx',
    ),
    'utf8',
  )

  assert.match(globalStyles, /'PingFang SC'/)
  assert.match(globalStyles, /'Hiragino Kaku Gothic ProN'/)
  assert.doesNotMatch(
    `${globalStyles}\n${managePage}\n${reviewPage}`,
    /font-serif|Songti|STSong|Mincho|Noto Serif|Source Serif|Times New Roman/,
  )
  assert.match(articleReader, /className='font-reading-body-ja /)
  assert.doesNotMatch(articleReader, /className='font-reading-ja /)
})

test('listening import accepts MP3 uploads and supports multiple collections', async () => {
  const uploadForm = await readFile(
    path.join(ROOT, 'features/import/ui/UploadForm.tsx'),
    'utf8',
  )
  const uploadAction = await readFile(
    path.join(ROOT, 'features/import/actions.ts'),
    'utf8',
  )
  const questionEditor = await readFile(
    path.join(ROOT, 'features/collections/ui/LessonQuestionsPanel.tsx'),
    'utf8',
  )

  assert.match(uploadForm, /accept='\.mp3,audio\/mpeg'/)
  assert.match(uploadForm, /normalizeListeningAudioPath/)
  assert.match(uploadForm, /name='collectionIds'/)
  assert.match(uploadForm, /继续添加其他集合/)
  assert.doesNotMatch(uploadForm, /当前仅显示正式试卷/)
  assert.doesNotMatch(uploadForm, /批量录入说明/)
  assert.match(questionEditor, /快速填写题目与选项/)
  assert.match(questionEditor, /handleQuickOptionInput/)
  assert.match(questionEditor, /parseMultiQuizText\(value\)\[0\]/)
  assert.match(questionEditor, /正确答案/)
  assert.equal(uploadForm.includes("paper.materialType === materialType"), false)
  assert.match(
    uploadForm,
    /isCollectionTypeAllowedForMaterial\(\s*materialType/,
  )
  assert.match(uploadAction, /getAll\('collectionIds'\)/)
  assert.match(
    uploadAction,
    /getMaterialCollectionTypeError\(/,
  )
  assert.match(uploadAction, /mp3Only && ext !== '\.mp3'/)
  assert.match(uploadAction, /collectionIds\.map\(targetCollectionId/)
})

test('search results use domain editors instead of the hidden JSON tool', async () => {
  const searchHrefBuilder = await readFile(
    path.join(ROOT, 'features/search/domain.ts'),
    'utf8',
  )

  assert.match(searchHrefBuilder, /`\/manage\/reading\/\$\{encodeURIComponent\(id\)\}`/)
  assert.match(searchHrefBuilder, /`\/manage\/questions\/\$\{encodeURIComponent\(id\)\}`/)
  assert.equal(searchHrefBuilder.includes('/manage/search/'), false)
})

test('responsive and component-boundary regressions remain guarded', async () => {
  const subtitlePage = await readFile(
    path.join(ROOT, 'app/(library)/subtitles/page.tsx'),
    'utf8',
  )
  assert.match(
    subtitlePage,
    /min-w-0 divide-y divide-slate-200/,
  )

  const boundaries = [
    'modules/knowledge/vocabulary/components/VocabularySentenceText.tsx',
    'modules/import/audio/hooks/useAudioFileCatalog.ts',
    'modules/media-subtitles/components/SubtitleReaderControls.tsx',
    'components/AudioPlayer/ListeningPlayerHeader.tsx',
    'components/AudioPlayer/ListeningSentenceRow.tsx',
  ]
  for (const file of boundaries) {
    assert.equal((await stat(path.join(ROOT, file))).isFile(), true)
  }
})

test('practice player keeps one compact action bar', async () => {
  const player = await readFile(
    path.join(ROOT, 'components/exam/PracticePlayer.tsx'),
    'utf8',
  )
  const copyActions = player.match(
    /onClick=\{\(\) => void handleCopyCurrentQuestion\(\)\}/g,
  )

  assert.equal(copyActions?.length, 1)
  assert.match(player, /role='progressbar'/)
  assert.match(player, /session\.isSubmitted && persistState !== 'saving'/)
  assert.match(player, /\{exitLabel\}/)
  assert.match(player, /grid-cols-\[minmax\(0,0\.8fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)\]/)
  assert.equal(player.includes("className='flex flex-col gap-3 md:flex-row"), false)
})

test('custom practice can target new, attempted, or all questions', async () => {
  const builder = await readFile(
    path.join(
      ROOT,
      'app/(study)/practice/custom/CustomPaperBuilderClient.tsx',
    ),
    'utf8',
  )
  const customSession = await readFile(
    path.join(ROOT, 'app/(study)/practice/custom/do/page.tsx'),
    'utf8',
  )
  const repository = await readFile(
    path.join(ROOT, 'lib/repositories/exam/index.ts'),
    'utf8',
  )

  assert.match(builder, /'unattempted' \| 'attempted' \| 'all'/)
  assert.match(builder, /params\.set\('scope', filters\.scope\)/)
  assert.match(builder, /开始练未做题/)
  assert.match(builder, /开始复习已做题/)
  assert.match(builder, /fixed inset-x-0 bottom-0/)
  assert.match(customSession, /rawScope === 'attempted' \|\| rawScope === 'all'/)
  assert.match(repository, /attempts: \{ none: \{\} \}/)
  assert.match(repository, /attempts: \{ some: \{\} \}/)
})

test('form controls share styled selects and an explicit number stepper', async () => {
  const globalStyles = await readFile(path.join(ROOT, 'app/globals.css'), 'utf8')
  const numberStepper = await readFile(
    path.join(ROOT, 'components/ui/NumberStepper.tsx'),
    'utf8',
  )
  const builder = await readFile(
    path.join(
      ROOT,
      'app/(study)/practice/custom/CustomPaperBuilderClient.tsx',
    ),
    'utf8',
  )

  assert.match(globalStyles, /select:not\(\[multiple\]\)/)
  assert.match(globalStyles, /background-image: url\(/)
  assert.match(globalStyles, /input\[type='number'\]::-webkit-inner-spin-button/)
  assert.match(numberStepper, /aria-label=\{`\$\{ariaLabel\}减少`\}/)
  assert.match(numberStepper, /aria-label=\{`\$\{ariaLabel\}增加`\}/)
  assert.match(builder, /<NumberStepper/)
})

test('project dropdowns use the custom listbox instead of native select menus', async () => {
  const customSelect = await readFile(
    path.join(ROOT, 'components/ui/CustomSelect.tsx'),
    'utf8',
  )
  const migratedFiles = [
    'app/(admin)/manage/collections/CollectionEditor.tsx',
    'app/(admin)/manage/import/AnkiImportPanel.tsx',
    'app/(admin)/manage/vocabulary/page.tsx',
    'features/import/ui/UploadCenterUI.tsx',
    'features/import/ui/UploadForm.tsx',
    'features/listening/ui/ListeningListClient.tsx',
    'features/listening/ui/ListeningMetaForm.tsx',
    'features/listening/ui/ListeningQuickClassifyForm.tsx',
    'features/practice/ui/PaperAttributeForm.tsx',
    'features/practice/ui/PaperMaterialTypeBatchForm.tsx',
    'app/(study)/practice/PapersListClient.tsx',
    'app/(study)/practice/custom/CustomPaperBuilderClient.tsx',
    'modules/import/components/BulkQuizPanel.tsx',
    'modules/media-subtitles/components/SubtitleReaderControls.tsx',
  ]

  assert.match(customSelect, /createPortal/)
  assert.match(customSelect, /role='listbox'/)
  assert.match(customSelect, /event\.key === 'ArrowDown'/)
  assert.match(customSelect, /<input type='hidden' name=\{name\}/)
  for (const file of migratedFiles) {
    const source = await readFile(path.join(ROOT, file), 'utf8')
    assert.equal(source.includes('<select'), false)
    assert.match(source, /<CustomSelect/)
  }
})

test('practice review reveals answers only for submitted questions', async () => {
  const player = await readFile(
    path.join(ROOT, 'components/exam/PracticePlayer.tsx'),
    'utf8',
  )
  const readingPassage = await readFile(
    path.join(
      ROOT,
      'components/exam/question-renderer/readingPassage.ts',
    ),
    'utf8',
  )
  const optionsList = await readFile(
    path.join(ROOT, 'components/exam/question-renderer/OptionsList.tsx'),
    'utf8',
  )

  assert.match(
    player,
    /isSubmitted=\{session\.isQuestionSubmitted\(currentQuestion\.id\)\}/,
  )
  assert.match(player, /isInteractionLocked=\{session\.isSubmitted\}/)
  assert.match(readingPassage, /submittedQuestionIdSet\.has\(fillQuestion\.id\)/)
  assert.match(optionsList, /if \(isInteractionLocked\)/)
})

test('listening practice keeps compact controls and readable transcript', async () => {
  const renderer = await readFile(
    path.join(ROOT, 'components/exam/QuestionRenderer.tsx'),
    'utf8',
  )
  const transcript = await readFile(
    path.join(
      ROOT,
      'components/exam/question-renderer/ListeningTranscript.tsx',
    ),
    'utf8',
  )

  assert.equal(renderer.includes('每段音频对应一道题'), false)
  assert.equal(renderer.includes('单题音频'), false)
  assert.equal(renderer.includes('该听力题未填写文字题干'), false)
  assert.match(renderer, /normalizeQuestionDisplayText/)
  assert.match(transcript, /divide-y divide-slate-100/)
  assert.equal(transcript.includes('max-h-[45vh]'), false)
})

test('listening detail avoids idle animation work and uses scoped vocabulary sources', async () => {
  const controller = await readFile(
    path.join(ROOT, 'components/AudioPlayer/useAudioController.ts'),
    'utf8',
  )
  const detailPage = await readFile(
    path.join(ROOT, 'app/(study)/listening/[id]/page.tsx'),
    'utf8',
  )
  const player = await readFile(
    path.join(ROOT, 'components/AudioPlayer/AudioPlayer.tsx'),
    'utf8',
  )
  const sentenceRow = await readFile(
    path.join(ROOT, 'components/AudioPlayer/ListeningSentenceRow.tsx'),
    'utf8',
  )
  const listeningLanding = await readFile(
    path.join(ROOT, 'app/(study)/listening/page.tsx'),
    'utf8',
  )
  const listeningRepository = await readFile(
    path.join(ROOT, 'features/listening/server/repository.ts'),
    'utf8',
  )
  const listeningFilter = await readFile(
    path.join(ROOT, 'features/listening/ui/ListeningViewSwitcher.tsx'),
    'utf8',
  )
  const playerHeader = await readFile(
    path.join(ROOT, 'components/AudioPlayer/ListeningPlayerHeader.tsx'),
    'utf8',
  )

  assert.match(controller, /if \(audio\.paused\)/)
  assert.match(controller, /animationFrameId = null/)
  assert.match(detailPage, /buildAudioDialogueSourceId\(/)
  assert.equal(detailPage.includes('buildAudioDialogueSourceIdCandidates'), false)
  assert.equal(detailPage.includes('listListeningMaterialsForShadowing'), false)
  assert.match(player, /useTextSelection\(\)/)
  assert.equal(player.includes('onClick={closeSelection}'), false)
  assert.match(sentenceRow, /data-context-sentence='true'/)
  assert.equal(sentenceRow.includes("isActive && currentState === 'idle'"), false)
  assert.match(listeningRepository, /lastPlayedAt: true/)
  assert.equal(listeningLanding.includes('最近收听'), false)
  assert.match(listeningLanding, /group\/chapter/)
  assert.match(listeningLanding, /group\/section/)
  assert.match(listeningLanding, /max-h-\[min\(28rem,70vh\)\]/)
  assert.match(listeningLanding, /ListeningViewSwitcher/)
  assert.match(listeningFilter, /筛选材料/)
  assert.match(listeningFilter, /教材、章节或材料名/)
  assert.match(listeningFilter, /filters\.kind !== 'all'/)
  assert.match(listeningFilter, /filters\.language !== 'all'/)
  assert.match(listeningFilter, /entry\.languages\.includes/)
  assert.match(listeningFilter, /entry\.searchText/)
  assert.match(listeningLanding, /materialLanguageLabel/)
  assert.equal(
    listeningLanding.includes('grid-cols-[auto_minmax(0,1fr)_auto]'),
    false,
  )
  assert.equal(playerHeader.includes("· 累计{' '}"), false)
})

test('vocabulary language groups use pronunciation and source evidence', async () => {
  const languageResolver = await readFile(
    path.join(
      ROOT,
      'modules/knowledge/vocabulary/domain/language.ts',
    ),
    'utf8',
  )
  const vocabularyPage = await readFile(
    path.join(ROOT, 'app/(knowledge)/vocabulary/page.tsx'),
    'utf8',
  )
  const vocabularyRepository = await readFile(
    path.join(
      ROOT,
      'modules/knowledge/vocabulary/server/repository.ts',
    ),
    'utf8',
  )

  assert.match(languageResolver, /pronunciations\.some\(containsKana\)/)
  assert.match(languageResolver, /JAPANESE_SOURCE_TYPES\.has\(sourceType\)/)
  assert.match(vocabularyPage, /resolveVocabularyLanguageCode/)
  assert.match(vocabularyRepository, /pronunciations: true/)
  assert.match(vocabularyRepository, /sourceType: true/)
})

test('selection popover supports pointer, touch, keyboard and dialog semantics', async () => {
  const hook = await readFile(
    path.join(ROOT, 'hooks/useTextSelection.ts'),
    'utf8',
  )
  const tooltip = await readFile(
    path.join(ROOT, 'components/exam/WordTooltip.tsx'),
    'utf8',
  )

  assert.match(hook, /selectionchange/)
  assert.match(hook, /pointerup/)
  assert.match(hook, /touchend/)
  assert.match(hook, /pointerActiveRef\.current \|\| touchActiveRef\.current/)
  assert.match(hook, /getSelectionFingerprint\(\) === previousSelection/)
  assert.match(hook, /lastKeyboardSelectionAtRef\.current > 500/)
  assert.match(hook, /scheduleSelectionCommit\(240\)/)
  assert.match(hook, /window\.addEventListener\('scroll', handleWindowScroll/)
  assert.match(hook, /event\.key === 'Escape'/)
  assert.match(tooltip, /role='dialog'/)
  assert.match(tooltip, /aria-label='关闭词条编辑'/)
  assert.match(tooltip, /window\.visualViewport/)
})
