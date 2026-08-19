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

function splitMarkdownTableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

const isMarkdownTableRow = (line: string) =>
  /^\s*\|.+\|\s*$/.test(line)

const isMarkdownTableSeparator = (line: string) => {
  if (!isMarkdownTableRow(line)) return false
  const cells = splitMarkdownTableCells(line)
  return (
    cells.length >= 2 &&
    cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
  )
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
    if (
      isMarkdownTableRow(lines[index]) &&
      isMarkdownTableSeparator(lines[index + 1] || '')
    ) {
      flushText()
      const rows = [splitMarkdownTableCells(lines[index])]
      let cursor = index + 2
      while (cursor < lines.length && isMarkdownTableRow(lines[cursor])) {
        rows.push(splitMarkdownTableCells(lines[cursor]))
        cursor += 1
      }
      blocks.push({ type: 'table', rows: normalizeTableRows(rows), hasHeader: true })
      index = cursor
      continue
    }

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

export function renderSafeArticleContentBlocksHtml(
  blocks: ArticleContentBlock[],
) {
  return blocks
    .map(block => {
      if (block.type === 'table') {
        const bodyRows = block.hasHeader ? block.rows.slice(1) : block.rows
        const header = block.hasHeader
          ? `<thead><tr>${block.rows[0]
              .map(cell => `<th scope="col">${cell}</th>`)
              .join('')}</tr></thead>`
          : ''
        const body = bodyRows
          .map(
            row =>
              `<tr>${row
                .map((cell, index) =>
                  block.hasHeader && index === 0
                    ? `<th scope="row">${cell}</th>`
                    : `<td>${cell}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')
        return `<div class="article-structured-table-wrap"><table class="article-structured-table">${header}<tbody>${body}</tbody></table></div>`
      }

      if (block.type === 'math') {
        return `<div class="article-structured-math">${block.expression}</div>`
      }

      return `<p>${block.text.replace(/\n/g, '<br />')}</p>`
    })
    .join('')
}
