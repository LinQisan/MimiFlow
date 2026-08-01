const INTERNAL_EMPTY_TEXT_PATTERN =
  /^[（(]?\s*(?:未填写|缺少|暂无)(?:语境句|上下文|文字题干)\s*[）)]?$/

export function normalizeQuestionDisplayText(
  value: string | null | undefined,
): string | null {
  const trimmed = (value || '').trim()
  if (!trimmed) return null

  const withoutMarkdownMarkers = trimmed.replace(/^\*+|\*+$/g, '').trim()
  if (INTERNAL_EMPTY_TEXT_PATTERN.test(withoutMarkdownMarkers)) return null

  return trimmed
}
