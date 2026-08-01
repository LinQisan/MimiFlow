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

const ROOT = process.cwd()

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
    path.join(ROOT, 'app/(admin)/papers/manage/actions.ts'),
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

test('search results use the canonical management detail route', async () => {
  const searchHrefBuilder = await readFile(
    path.join(ROOT, 'app/actions/globalSearchShared.ts'),
    'utf8',
  )

  assert.match(
    searchHrefBuilder,
    /`\/manage\/search\/\$\{encodeURIComponent\(type\)\}\/\$\{encodeURIComponent\(resultId\)\}`/,
  )
  assert.equal(searchHrefBuilder.includes('/manage/search?'), false)
})

test('responsive and component-boundary regressions remain guarded', async () => {
  const subtitlePage = await readFile(
    path.join(ROOT, 'app/(library)/subtitles/page.tsx'),
    'utf8',
  )
  assert.match(
    subtitlePage,
    /grid min-w-0 grid-cols-\[minmax\(0,1fr\)\]/,
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
    'app/(admin)/manage/collections/page.tsx',
    'app/(admin)/manage/import/AnkiImportPanel.tsx',
    'app/(admin)/manage/vocabulary/page.tsx',
    'app/(admin)/upload/UploadCenterUI.tsx',
    'app/(admin)/upload/UploadForm.tsx',
    'app/(study)/listening/ListeningListClient.tsx',
    'app/(study)/listening/ListeningMetaForm.tsx',
    'app/(study)/listening/ListeningQuickClassifyForm.tsx',
    'app/(study)/practice/PaperAttributeForm.tsx',
    'app/(study)/practice/PaperMaterialTypeBatchForm.tsx',
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

  assert.match(controller, /if \(audio\.paused\)/)
  assert.match(controller, /animationFrameId = null/)
  assert.match(detailPage, /buildAudioDialogueSourceIdCandidates/)
  assert.equal(detailPage.includes('listListeningMaterialsForShadowing'), false)
  assert.match(player, /useTextSelection\(\)/)
  assert.equal(player.includes('onClick={closeSelection}'), false)
  assert.match(sentenceRow, /data-context-sentence='true'/)
  assert.equal(sentenceRow.includes("isActive && currentState === 'idle'"), false)
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

  assert.match(languageResolver, /pronunciations\.some\(containsKana\)/)
  assert.match(languageResolver, /JAPANESE_SOURCE_TYPES\.has\(sourceType\)/)
  assert.match(vocabularyPage, /resolveVocabularyLanguageCode/)
  assert.match(vocabularyPage, /pronunciations: true/)
  assert.match(vocabularyPage, /sourceType: true/)
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
