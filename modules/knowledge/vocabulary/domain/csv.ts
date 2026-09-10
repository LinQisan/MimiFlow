export const VOCABULARY_CSV_HEADERS = [
  '词条ID',
  '单词',
  '语言',
  '注音',
  '词源',
  '词性',
  'JLPT',
  '标签',
  '释义',
  '例句',
  '例句词性',
] as const

export type VocabularyCsvRow = Record<(typeof VOCABULARY_CSV_HEADERS)[number], string>

const protectSpreadsheetCell = (value: string) =>
  /^[=+\-@]/.test(value) ? `'${value}` : value

const restoreSpreadsheetCell = (value: string) =>
  /^'[=+\-@]/.test(value) ? value.slice(1) : value

const escapeCsvCell = (value: string) => {
  const safe = protectSpreadsheetCell(value)
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export const serializeVocabularyCsv = (rows: VocabularyCsvRow[]) =>
  `\uFEFF${[VOCABULARY_CSV_HEADERS, ...rows.map(row =>
    VOCABULARY_CSV_HEADERS.map(header => row[header] || ''),
  )]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\r\n')}\r\n`

const parseCsvCells = (text: string) => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号')
  row.push(cell)
  if (row.some(value => value.length > 0)) rows.push(row)
  return rows
}

const OPTIONAL_VOCABULARY_CSV_HEADERS = new Set([
  '词源',
  'JLPT',
  '例句',
  '例句词性',
])

export const parseVocabularyCsvDocument = (text: string) => {
  const rows = parseCsvCells(text.replace(/^\uFEFF/, ''))
  const headers = rows.shift()?.map(header => header.trim()) || []
  const indexes = new Map(headers.map((header, index) => [header, index]))
  const missing = VOCABULARY_CSV_HEADERS.filter(
    header => !OPTIONAL_VOCABULARY_CSV_HEADERS.has(header) && !indexes.has(header),
  )
  if (missing.length > 0) throw new Error(`缺少列：${missing.join('、')}`)
  if (indexes.has('例句词性') && !indexes.has('例句')) {
    throw new Error('缺少列：例句')
  }

  const parsedRows = rows.map((cells, rowIndex) => {
    const row = Object.fromEntries(
      VOCABULARY_CSV_HEADERS.map(header => {
        const rawValue = cells[indexes.get(header)!] || ''
        const value = header === '例句' || header === '例句词性'
          ? rawValue.replace(/\r\n/g, '\n')
          : rawValue.trim()
        return [header, restoreSpreadsheetCell(value)]
      }),
    ) as VocabularyCsvRow
    if (!row.词条ID) throw new Error(`第 ${rowIndex + 2} 行缺少词条ID`)
    if (!row.单词) throw new Error(`第 ${rowIndex + 2} 行缺少单词`)
    return row
  })
  return { headers, rows: parsedRows }
}

export const splitVocabularyCsvList = (value: string) =>
  Array.from(
    new Set(value.split(/\s*(?:\||；|;|\n)\s*/).map(item => item.trim()).filter(Boolean)),
  )

export const splitVocabularyCsvPartsOfSpeech = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/\s*(?:\||,|，|；|;|\n)\s*/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

export type VocabularyCsvSentence = {
  text: string
  posTags: string[]
}

export const normalizeVocabularyCsvSentenceText = (value: string) =>
  value.trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')

export const serializeVocabularyCsvSentences = (
  sentences: VocabularyCsvSentence[],
) => {
  const byText = new Map<string, Set<string>>()
  sentences.forEach(sentence => {
    const text = normalizeVocabularyCsvSentenceText(sentence.text)
    if (!text) return
    const tags = byText.get(text) || new Set<string>()
    sentence.posTags.forEach(tag => {
      const normalized = tag.trim()
      if (normalized) tags.add(normalized)
    })
    byText.set(text, tags)
  })
  const entries = [...byText].map(([text, tags]) => ({
    text,
    posTags: [...tags],
  }))
  return {
    例句: entries.map(entry => entry.text).join('\n'),
    例句词性: entries.map(entry => entry.posTags.join(',')).join('\n'),
  }
}

export const parseVocabularyCsvSentences = (
  sentenceText: string,
  sentencePartsOfSpeech: string,
): VocabularyCsvSentence[] => {
  const sentences = sentenceText
    .split(/\r?\n/)
    .map(normalizeVocabularyCsvSentenceText)
  const partsOfSpeechRows = sentencePartsOfSpeech.split(/\r?\n/)
  return sentences.flatMap((text, index) =>
    text
      ? [{
          text,
          posTags: splitVocabularyCsvPartsOfSpeech(partsOfSpeechRows[index] || ''),
        }]
      : [],
  )
}
