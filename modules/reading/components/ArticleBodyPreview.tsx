import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/modules/reading/domain/article-blocks'
import {
  parseArticleFootnotes,
  replaceArticleFootnoteReferences,
} from '@/modules/reading/domain/article-footnotes'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import { renderUnderlineMarkup } from '@/utils/text/underlineMarkup'

export default function ArticleBodyPreview({
  text,
  className = 'min-h-[68vh]',
  fillBlankTokens = [],
}: {
  text: string
  className?: string
  fillBlankTokens?: string[]
}) {
  const document = parseArticleFootnotes(text)
  const bodyHtml = renderUnderlineMarkup(
    renderSafeArticleContentBlocksHtml(
      parseArticleContentBlocks(
        escapeHtml(document.body)
          .split(/\n\s*\n/)
          .map(paragraph => paragraph.trim())
          .filter(Boolean),
      ),
    ),
  )
  const withReferences = replaceArticleFootnoteReferences(
    bodyHtml,
    document.footnotes,
    footnote =>
      `<sup class="mx-0.5"><a href="#article-preview-note-${footnote.id}" class="rounded px-0.5 text-[0.65em] font-semibold text-slate-500 no-underline">注${footnote.label}</a></sup>`,
  )
  const uniqueBlankTokens = [...new Set(fillBlankTokens.filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  )
  const withFillBlanks = uniqueBlankTokens.reduce((html, token, index) => {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const label = token.match(/\d+/)?.[0] || String(index + 1)
    return html.replace(
      new RegExp(escapedToken, 'g'),
      `<span class="article-blank-empty mx-1 inline-block border-b-2 border-slate-500 px-3 py-0 font-semibold tabular-nums text-slate-500" aria-label="問題7第${label}空">(${label})</span>`,
    )
  }, withReferences)
  const footnotes = document.footnotes.length
    ? `<aside aria-label="文章脚注" class="mt-10"><ol class="space-y-2 text-sm leading-7 text-slate-600">${document.footnotes
        .map(
          footnote =>
            `<li id="article-preview-note-${footnote.id}" class="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 border-b border-slate-100 pb-2"><span class="text-xs font-semibold text-slate-400">注${footnote.label}</span><span>${renderUnderlineMarkup(escapeHtml(footnote.definition))}</span></li>`,
        )
        .join('')}</ol></aside>`
    : ''

  return (
    <div
      className={`reading-passage-body bg-white px-6 py-6 text-[1.05rem] leading-9 text-slate-800 md:px-8 ${className}`}
      dangerouslySetInnerHTML={{ __html: `${withFillBlanks}${footnotes}` }}
    />
  )
}
