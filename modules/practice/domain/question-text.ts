const INTERNAL_EMPTY_TEXT_PATTERN =
  /^[（(]?\s*(?:听力\s*)?(?:未填写|缺少|暂无)(?:语境句|上下文|文字题干)\s*[）)]?$/

export function normalizeQuestionDisplayText(
  value: string | null | undefined,
): string | null {
  const trimmed = (value || '').trim()
  if (!trimmed) return null

  const withoutMarkdownMarkers = trimmed.replace(/^\*+|\*+$/g, '').trim()
  if (INTERNAL_EMPTY_TEXT_PATTERN.test(withoutMarkdownMarkers)) return null

  return trimmed
}

const comparableQuestionText = (value: string) =>
  value.replace(/\s+/g, ' ').trim()

const QUESTION_TYPES_WITHOUT_SEPARATE_CONTEXT = new Set([
  'GRAMMAR',
  'GRAMMAR_SELECTION',
  'PRONUNCIATION',
  'SYNONYM_REPLACEMENT',
  'WORD_DISTINCTION',
  'SORTING',
  'TOEIC_PHOTOGRAPH',
  'TOEIC_QUESTION_RESPONSE',
  'TOEIC_CONVERSATIONS',
  'TOEIC_TALKS',
  'TOEIC_INCOMPLETE_SENTENCES',
])

export function supportsSeparateQuestionContext(questionType: string) {
  return !QUESTION_TYPES_WITHOUT_SEPARATE_CONTEXT.has(questionType)
}

const QUESTION_TYPES_WITH_EXPLICIT_TARGET_WORD = new Set([
  'PRONUNCIATION',
  'SYNONYM_REPLACEMENT',
])

export function usesExplicitQuestionTargetWord(questionType: string) {
  return QUESTION_TYPES_WITH_EXPLICIT_TARGET_WORD.has(questionType)
}

export const QUESTION_BLANK_PATTERN =
  /\[\s*\d+\s*\]|［\s*\d+\s*］|\(\s*\d+\s*\)|（\s*\d+\s*）|【\s*\d+\s*】|「\s*\d+\s*」|『\s*\d+\s*』|[（(]\s*[）)]|[＿_]{2,}|[★＊]|～/

type QuestionOptionText = {
  id?: unknown
  text?: unknown
}

const toAnswerIds = (answer: unknown) =>
  new Set(
    (Array.isArray(answer) ? answer : [answer]).filter(
      (item): item is string => typeof item === 'string',
    ),
  )

export function fillQuestionBlank(text: string, replacement: string) {
  if (!replacement || !QUESTION_BLANK_PATTERN.test(text)) return text
  return text.replace(QUESTION_BLANK_PATTERN, replacement)
}

/**
 * Grammar questions store the blank prompt as canonical text. A completed
 * sentence is derived only when another feature, such as vocabulary examples,
 * needs it.
 */
export function buildCompletedQuestionText(
  prompt: string | null | undefined,
  options: unknown,
  answer: unknown,
) {
  const promptText = normalizeQuestionDisplayText(prompt) || ''
  if (!promptText || !Array.isArray(options)) return promptText

  const answerIds = toAnswerIds(answer)
  const correctOption = (options as QuestionOptionText[]).find(
    option => typeof option.id === 'string' && answerIds.has(option.id),
  )
  const correctText =
    typeof correctOption?.text === 'string' ? correctOption.text.trim() : ''
  return fillQuestionBlank(promptText, correctText)
}

const SORTING_SLOT_TOKEN = '[[sort]]'
const SORTING_STAR_SLOT_TOKEN = '[[sort:star]]'

const CANONICAL_SORTING_SLOT_PATTERN = /\[\[sort(?::star)?\]\]/g
const LEGACY_SORTING_SLOT_PATTERN =
  /[＿_]{2,}[★＊][＿_]{2,}|[★＊][ \u3000]*(?:[＿_]{2,})?|[＿_]{2,}|[（(][\s　]*[）)]|[（(]\s*\d+\s*[）)]|\[\s*\d+\s*\]|［\s*\d+\s*］/g

type SortingPromptSegment = {
  text: string
  slotIndex: number | null
  isStar: boolean
}

/**
 * Sorting prompts are persisted with semantic tokens so storage does not
 * depend on whether the imported paper used parentheses or underline glyphs.
 */
export function normalizeSortingPrompt(value: string | null | undefined) {
  const prompt = (value || '').trim()
  if (!prompt) return ''
  return prompt.replace(LEGACY_SORTING_SLOT_PATTERN, token =>
    /[★＊]/.test(token) ? SORTING_STAR_SLOT_TOKEN : SORTING_SLOT_TOKEN,
  )
}

export function parseSortingPrompt(value: string | null | undefined) {
  const prompt = normalizeSortingPrompt(value)
  const segments: SortingPromptSegment[] = []
  let cursor = 0
  let slotIndex = 0

  for (const match of prompt.matchAll(CANONICAL_SORTING_SLOT_PATTERN)) {
    const index = match.index || 0
    if (index > cursor) {
      segments.push({
        text: prompt.slice(cursor, index),
        slotIndex: null,
        isStar: false,
      })
    }
    segments.push({
      text: match[0],
      slotIndex,
      isStar: match[0] === SORTING_STAR_SLOT_TOKEN,
    })
    slotIndex += 1
    cursor = index + match[0].length
  }
  if (cursor < prompt.length) {
    segments.push({
      text: prompt.slice(cursor),
      slotIndex: null,
      isStar: false,
    })
  }

  return {
    prompt,
    segments,
    slotCount: slotIndex,
    starCount: segments.filter(segment => segment.isStar).length,
    starIndex: segments.find(segment => segment.isStar)?.slotIndex ?? -1,
  }
}

export function buildCompletedSortingText(
  prompt: string | null | undefined,
  options: unknown,
  sortingOrder: unknown,
) {
  const promptText = normalizeSortingPrompt(prompt)
  if (
    !promptText ||
    !Array.isArray(options) ||
    !Array.isArray(sortingOrder)
  )
    return promptText

  const optionRows = options as QuestionOptionText[]
  const orderedText = sortingOrder.map(index => {
    if (typeof index !== 'number' || !Number.isInteger(index)) return ''
    const text = optionRows[index]?.text
    return typeof text === 'string' ? text.trim() : ''
  })
  if (orderedText.length !== optionRows.length || orderedText.some(text => !text))
    return promptText

  let slotIndex = 0
  return promptText.replace(
    CANONICAL_SORTING_SLOT_PATTERN,
    () => orderedText[slotIndex++] || '',
  )
}

/**
 * Prompt is the learner-facing question. Context is optional supporting text and
 * must not persist a second copy of the prompt.
 */
export function normalizeQuestionTextFields(
  prompt: string | null | undefined,
  context: string | null | undefined,
) {
  const normalizedPrompt = normalizeQuestionDisplayText(prompt)
  const normalizedContext = normalizeQuestionDisplayText(context)
  const isDuplicate =
    normalizedPrompt &&
    normalizedContext &&
    comparableQuestionText(normalizedPrompt) ===
      comparableQuestionText(normalizedContext)

  return {
    prompt: normalizedPrompt,
    context: isDuplicate ? null : normalizedContext,
  }
}
