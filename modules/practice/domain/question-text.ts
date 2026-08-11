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
