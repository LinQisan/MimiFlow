type ArticleTextBlock = {
  type: 'text'
  text: string
}

type ArticleTableBlock = {
  type: 'table'
  rows: string[][]
  hasHeader: boolean
}

export type ArticleMathBlock = {
  type: 'math'
  expression: string
}

export type ArticleContentBlock =
  | ArticleTextBlock
  | ArticleTableBlock
  | ArticleMathBlock

function parseDisplayMath(paragraph: string): ArticleMathBlock | null {
  const trimmed = paragraph.trim()
  const dollarMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/)
  const bracketMatch = trimmed.match(/^\\\[([\s\S]+)\\\]$/)
  const expression = (dollarMatch?.[1] || bracketMatch?.[1] || '').trim()
  return expression ? { type: 'math', expression } : null
}

function splitTableCells(line: string) {
  return line
    .trim()
    .split(/(?:[ \u3000]{2,}|\t+)/)
    .map(cell => cell.trim())
    .filter(Boolean)
}

function normalizeTableRows(rows: string[][]) {
  const columnCount = Math.max(...rows.map(row => row.length))
  return rows.map((row, index) => {
    if (row.length === columnCount) return row
    const missing = columnCount - row.length
    // Printed schedules commonly omit the top-left label cell.
    if (index === 0 && missing > 0) {
      return [...Array.from({ length: missing }, () => ''), ...row]
    }
    return [...row, ...Array.from({ length: missing }, () => '')]
  })
}

function parseParagraph(paragraph: string): ArticleContentBlock[] {
  const lines = paragraph
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
  const blocks: ArticleContentBlock[] = []
  const textLines: string[] = []

  const flushText = () => {
    if (textLines.length === 0) return
    blocks.push({ type: 'text', text: textLines.join('\n') })
    textLines.length = 0
  }

  for (let index = 0; index < lines.length;) {
    const candidateRows: string[][] = []
    let cursor = index
    while (cursor < lines.length) {
      const cells = splitTableCells(lines[cursor])
      if (cells.length < 2) break
      candidateRows.push(cells)
      cursor += 1
    }

    if (candidateRows.length >= 2) {
      flushText()
      const rows = normalizeTableRows(candidateRows)
      blocks.push({
        type: 'table',
        rows,
        hasHeader: rows[0][0] === '',
      })
      index = cursor
      continue
    }

    textLines.push(lines[index].trim())
    index += 1
  }

  flushText()
  return blocks
}

export function parseArticleContentBlocks(paragraphs: string[]) {
  return paragraphs.flatMap(paragraph => {
    const math = parseDisplayMath(paragraph)
    return math ? [math] : parseParagraph(paragraph)
  })
}
