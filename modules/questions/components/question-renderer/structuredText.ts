import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/modules/reading/domain/article-blocks'

const STRUCTURED_TEXT_PATTERN =
  /(?:^|\n)\s*\|.+\|\s*$/m

export const hasStructuredText = (text: string) =>
  STRUCTURED_TEXT_PATTERN.test(text)

export function renderSafeStructuredText(
  safeAnnotatedText: string,
  { force = false }: { force?: boolean } = {},
) {
  if (!force && !hasStructuredText(safeAnnotatedText)) {
    return safeAnnotatedText
  }

  return renderSafeArticleContentBlocksHtml(
    parseArticleContentBlocks(
      safeAnnotatedText
        .split(/\n\s*\n/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean),
    ),
  )
}
