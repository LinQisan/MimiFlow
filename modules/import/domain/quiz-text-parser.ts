import type { ParsedQuizDraft } from '../types'
import { normalizeSortingPrompt } from '../../practice/domain/question-text.ts'

const CIRCLED_NUMBER_INDEX: Record<string, number> = {
  '①': 0,
  '②': 1,
  '③': 2,
  '④': 3,
  '⑤': 4,
  '⑥': 5,
  '⑦': 6,
  '⑧': 7,
  '⑨': 8,
}

const detectQuestionType = (
  prompt: string,
  options: string[] = [],
): ParsedQuizDraft['questionType'] => {
  const text = `${prompt}\n${options.join('\n')}`
  const isFillBlank =
    /[（(][\s　]*[）)]|__{2,}|[＿_]{2,}|～|\[\d+\]|［\d+］|【\d+】|「\d+」|『\d+』/.test(
      prompt,
    )
  const compactPrompt = prompt.replace(/\s+/g, '').trim()
  const sentenceLikeOptionCount = options.filter(
    item => item.length >= 10 || /[。！？.!?]/.test(item),
  ).length
  const isWordDistinction =
    compactPrompt.length > 0 &&
    compactPrompt.length <= 8 &&
    /[\u3040-\u30ff\u4e00-\u9fff]/.test(compactPrompt) &&
    !/[。！？.!?]/.test(compactPrompt) &&
    options.length >= 2 &&
    sentenceLikeOptionCount >= 3

  if (/★|＊/.test(text)) return 'SORTING'
  if (isFillBlank) return 'GRAMMAR'
  if (isWordDistinction) return 'WORD_DISTINCTION'
  if (/文法|語法|语法|助詞|助词|接続|接续|活用/.test(prompt)) return 'GRAMMAR'
  return 'PRONUNCIATION'
}

const parseOptionLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return null
  const digit = line.match(/^([1-9])[．.、)\s]+([\s\S]*)$/)
  if (digit)
    return { index: Number(digit[1]) - 1, text: (digit[2] || '').trim() }
  const circled = line.match(/^([①②③④⑤⑥⑦⑧⑨])[ \t　]*([\s\S]*)$/)
  if (circled)
    return {
      index: CIRCLED_NUMBER_INDEX[circled[1]],
      text: (circled[2] || '').trim(),
    }
  const alpha = line.match(/^([A-Ia-i])[．.、)\s]+([\s\S]*)$/)
  if (alpha)
    return {
      index: alpha[1].toUpperCase().charCodeAt(0) - 65,
      text: (alpha[2] || '').trim(),
    }
  return null
}

const parseInlineOptionSet = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return null
  const markerToIndex: Record<string, number> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '6': 5,
    '7': 6,
    '8': 7,
    '9': 8,
    ...CIRCLED_NUMBER_INDEX,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
  }
  const markerRegex =
    /(^|[\s　])([1-9①②③④⑤⑥⑦⑧⑨A-Ia-i])[．.、，:：)\-]?\s*/g
  const markers: Array<{ start: number; end: number; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = markerRegex.exec(line)) !== null) {
    const mapped = markerToIndex[match[2].toUpperCase()]
    if (mapped === undefined) continue
    markers.push({
      start: match.index + match[1].length,
      end: markerRegex.lastIndex,
      index: mapped,
    })
  }
  if (markers.length < 2) return null
  for (let index = 0; index < markers.length - 1; index += 1) {
    if (markers[index]?.index !== 0) continue
    const window = [markers[index]]
    for (let cursor = index + 1; cursor < markers.length; cursor += 1) {
      if (markers[cursor]?.index !== window.length) break
      window.push(markers[cursor])
    }
    if (window.length < 2) continue
    const options = window.map((current, position) =>
      line
        .slice(current.end, window[position + 1]?.start || line.length)
        .trim(),
    )
    if (options.every(Boolean))
      return {
        prompt: line.slice(0, window[0].start).trim(),
        options,
      }
  }
  return null
}

const parseQuestionHeaderLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return { isHeader: false, text: '' }
  const patterns = [
    /^\s*[（(]\d+[）)]\s*([\s\S]*)$/,
    /^\s*[（(]?\d+[）)]?[．.、，:：)\-]\s*([\s\S]*)$/,
    /^\s*\d{2,}[\t　 ]+([^\d\s][\s\S]*)$/,
    /^\s*第\s*\d+\s*[题題問]\s*[：:.\-、，]?\s*([\s\S]*)$/,
    /^\s*[Qq]\s*\d+\s*[：:.\-、，]?\s*([\s\S]*)$/,
  ]
  for (const pattern of patterns) {
    const matched = line.match(pattern)
    if (matched) return { isHeader: true, text: (matched[1] || '').trim() }
  }
  return { isHeader: false, text: line }
}

const splitLineByOptionMarkers = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return [] as string[]
  const markerRegex =
    /(^|[\s　])(①|②|③|④|⑤|⑥|⑦|⑧|⑨|[1-9](?:[．.、，:：)\-]|(?=[\t　 ]))|[A-Ia-i](?:[．.、，:：)\-]|(?=[\t　 ])))\s*/g
  const starts: number[] = []
  let match: RegExpExecArray | null
  while ((match = markerRegex.exec(line)) !== null)
    starts.push(match.index + match[1].length)
  if (starts.length <= 1) return [line]
  const parts: string[] = []
  const prefix = line.slice(0, starts[0]).trim()
  if (prefix) parts.push(prefix)
  starts.forEach((start, index) => {
    const chunk = line.slice(start, starts[index + 1] || line.length).trim()
    if (chunk) parts.push(chunk)
  })
  return parts.length > 0 ? parts : [line]
}

const createDraft = (
  prompt: string,
  options: string[],
  questionSerial: number | null = null,
): ParsedQuizDraft => {
  const targetWord = prompt.match(/\*\*([^*\n]+)\*\*/)?.[1]?.trim() || ''
  const normalizedPrompt = prompt.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  const detectedType = detectQuestionType(normalizedPrompt, options)
  const questionType =
    detectedType === 'GRAMMAR' &&
    questionSerial !== null &&
    questionSerial >= 26 &&
    questionSerial <= 35
      ? 'GRAMMAR_SELECTION'
      : detectedType
  return {
    questionType,
    prompt:
      questionType === 'SORTING'
        ? normalizeSortingPrompt(normalizedPrompt)
        : normalizedPrompt,
    contextSentence: '',
    targetWord,
    sortingOrder: [],
    explanation: '',
    sourceSerial: questionSerial ?? undefined,
    options: options.map((text, index) => ({
      text,
      isCorrect: index === 0,
    })),
  }
}

export const parseMultiQuizText = (input: string): ParsedQuizDraft[] => {
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\[ \t]*(?=\n|$)/g, '')
    .split('\n')
    .flatMap(splitLineByOptionMarkers)
  const results: ParsedQuizDraft[] = []
  let promptLines: string[] = []
  let options: string[] = []
  let seenOption = false
  let lastOptionIndex = -1
  let questionSerial: number | null = null

  const reset = () => {
    promptLines = []
    options = []
    seenOption = false
    lastOptionIndex = -1
    questionSerial = null
  }
  const flushIfReady = () => {
    const normalizedOptions = options.map(item => item.trim())
    if (normalizedOptions.length < 2 || !normalizedOptions.every(Boolean)) {
      return false
    }
    results.push(
      createDraft(
        promptLines.join('\n').trim(),
        normalizedOptions,
        questionSerial,
      ),
    )
    reset()
    return true
  }
  const stripLooseQuestionNumber = (line: string) =>
    line.replace(/^\s*[（(]?\d+[）)]?[．.、，:：)\-]?\s*/, '').trim()
  const isLikelySentencePrompt = (text: string) =>
    Boolean(text) && (/[。！？.!?]$/.test(text) || text.length >= 14)
  const isLooseNumberedPrompt = (line: string) =>
    /^\s*\d+\s+/.test(line) &&
    isLikelySentencePrompt(stripLooseQuestionNumber(line))
  const isOnlyQuestionSerial = (text: string) =>
    /^\s*\[?\d+\]?\s*[：:．.、)\-]?\s*$/.test(text)
  const readQuestionSerial = (line: string) => {
    const normalized = line.replace(/[０-９]/g, character =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    const matched = normalized.match(
      /^\s*(?:[（(\[［【「『]\s*)?(\d+)\s*(?:[）)\]］】」』])?(?:[．.、，:：)\-]|[\t　 ]+|\s*$)/,
    )
    return matched ? Number(matched[1]) : null
  }
  const shouldTreatAsQuestionHeader = (line: string, lineIndex: number) => {
    if (isOnlyQuestionSerial(line))
      return { isHeader: true, text: '' }
    const header = parseQuestionHeaderLine(line)
    const option = parseOptionLine(line)
    if (header.isHeader && !option)
      return { isHeader: true, text: header.text }
    let nextOptionIndex: number | null = null
    for (let index = lineIndex + 1; index < lines.length; index += 1) {
      const nextLine = lines[index].trim()
      if (!nextLine) continue
      nextOptionIndex = parseOptionLine(nextLine)?.index ?? null
      break
    }
    const loose = stripLooseQuestionNumber(line)
    if (
      header.isHeader &&
      nextOptionIndex === 0 &&
      isLikelySentencePrompt(loose)
    ) {
      return { isHeader: true, text: loose || header.text }
    }
    if (!option || option.index !== 0) return { isHeader: false, text: '' }
    if (nextOptionIndex === 0)
      return { isHeader: true, text: loose || header.text || line.trim() }
    if (nextOptionIndex === 1) return { isHeader: false, text: '' }
    if (isLikelySentencePrompt(loose)) return { isHeader: true, text: loose }
    if (header.isHeader) return { isHeader: true, text: header.text }
    return { isHeader: false, text: '' }
  }

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim()
    if (!line) {
      flushIfReady()
      return
    }
    const inlineSet = parseInlineOptionSet(line)
    if (inlineSet) {
      if (inlineSet.prompt && !isOnlyQuestionSerial(inlineSet.prompt)) {
        const header = parseQuestionHeaderLine(inlineSet.prompt)
        promptLines.push(
          !seenOption && promptLines.length === 0 && header.isHeader
            ? header.text
            : inlineSet.prompt,
        )
      }
      results.push(
        createDraft(
          promptLines.join('\n').trim() || inlineSet.prompt,
          inlineSet.options,
          questionSerial,
        ),
      )
      reset()
      return
    }
    const questionHeader = shouldTreatAsQuestionHeader(line, lineIndex)
    if (seenOption && questionHeader.isHeader) {
      if (!flushIfReady()) reset()
      questionSerial = readQuestionSerial(line)
      if (questionHeader.text) promptLines.push(questionHeader.text)
      return
    }
    const optionLine = parseOptionLine(line)
    const continuesCurrentOptionSequence =
      optionLine !== null && optionLine.index === lastOptionIndex + 1
    if (
      seenOption &&
      isLooseNumberedPrompt(line) &&
      !continuesCurrentOptionSequence
    ) {
      if (!flushIfReady()) reset()
      promptLines.push(stripLooseQuestionNumber(line))
      return
    }
    if (!seenOption && promptLines.length === 0) {
      if (questionSerial === null && isLooseNumberedPrompt(line)) {
        questionSerial = readQuestionSerial(line)
        promptLines.push(stripLooseQuestionNumber(line))
        return
      }
      if (questionHeader.isHeader) {
        questionSerial = readQuestionSerial(line)
        if (questionHeader.text) promptLines.push(questionHeader.text)
        return
      }
    }
    if (optionLine) {
      seenOption = true
      lastOptionIndex = optionLine.index
      options[optionLine.index] = optionLine.text
      return
    }
    if (!seenOption) {
      promptLines.push(line)
      return
    }
    if (lastOptionIndex >= 0 && lastOptionIndex < options.length)
      options[lastOptionIndex] = `${options[lastOptionIndex]} ${line}`.trim()
  })
  flushIfReady()
  return results
}
