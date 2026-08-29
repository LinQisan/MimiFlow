export type ArticleFootnote = {
  id: string
  label: string
  term: string
  definition: string
}

export type ArticleFootnoteDocument = {
  body: string
  footnotes: ArticleFootnote[]
}

const MARKDOWN_FOOTNOTE_DEFINITION =
  /^\s*\[\^([A-Za-z0-9_-]+)\]:\s*(.+?)\s*$/
const FOOTNOTE_REFERENCE = /\[\^([A-Za-z0-9_-]+)\]/g

export function parseArticleFootnotes(text: string): ArticleFootnoteDocument {
  const bodyLines: string[] = []
  const footnotes: ArticleFootnote[] = []

  for (const line of text.split(/\r?\n/)) {
    const markdownMatch = line.match(MARKDOWN_FOOTNOTE_DEFINITION)
    if (markdownMatch) {
      const rawId = markdownMatch[1]
      footnotes.push({
        id: rawId,
        label: rawId,
        term: '',
        definition: markdownMatch[2].trim(),
      })
      continue
    }

    bodyLines.push(line)
  }

  return {
    body: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    footnotes,
  }
}

export const replaceArticleFootnoteReferences = (
  text: string,
  footnotes: ArticleFootnote[],
  replacement: (footnote: ArticleFootnote) => string,
) => {
  const footnoteById = new Map(footnotes.map(footnote => [footnote.id, footnote]))
  return text.replace(FOOTNOTE_REFERENCE, (reference, id: string) => {
    const footnote = footnoteById.get(id)
    return footnote ? replacement(footnote) : reference
  })
}
