// app/admin/upload/UploadCenterUI.tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import UploadForm from './UploadForm'
import {
  createArticle,
  createQuizQuestion,
  createCategory,
} from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

interface Props {
  dbLevels: any[]
  dbCategories: any[]
}

type ArticlePreviewRow = {
  serial: string
  placeholderToken: string
  generatedPrompt: string
  isDuplicateToken: boolean
}

type ArticleImportedQuestionDraft = {
  questionType: string
  prompt: string
  contextSentence: string
  explanation: string
  options: { text: string; isCorrect: boolean }[]
  __previewToken?: string
  __previewDuplicateToken?: boolean
}

type ParsedQuizDraft = {
  questionType:
    | 'PRONUNCIATION'
    | 'FILL_BLANK'
    | 'SORTING'
    | 'GRAMMAR'
    | 'WORD_DISTINCTION'
  prompt: string
  contextSentence: string
  targetWord?: string
  explanation: string
  options: { text: string; isCorrect: boolean }[]
}

const CIRCLED_NUM_TO_INDEX: Record<string, number> = {
  '①': 0,
  '②': 1,
  '③': 2,
  '④': 3,
}

const detectQuestionType = (
  prompt: string,
  options: string[] = [],
): ParsedQuizDraft['questionType'] => {
  const text = `${prompt}\n${options.join('\n')}`
  const isSorting = /★|＊/.test(text)
  const isFillBlank =
    /[（(][\s　]*[）)]|__{2,}|～|\[\d+\]|［\d+］|【\d+】|「\d+」|『\d+』/.test(
      prompt,
    )
  const grammarHint = /文法|語法|语法|助詞|助词|接続|接续|活用/.test(prompt)
  const compactPrompt = prompt.replace(/\s+/g, '').trim()
  const sentenceLikeOptionCount = options.filter(
    item => item.length >= 10 || /[。！？.!?]/.test(item),
  ).length
  const isWordDistinction =
    compactPrompt.length > 0 &&
    compactPrompt.length <= 8 &&
    /[\u3040-\u30ff\u4e00-\u9fff]/.test(compactPrompt) &&
    !/[。！？.!?]/.test(compactPrompt) &&
    options.length === 4 &&
    sentenceLikeOptionCount >= 3

  if (isSorting) return 'SORTING'
  if (isFillBlank) return 'FILL_BLANK'
  if (isWordDistinction) return 'WORD_DISTINCTION'
  if (grammarHint) return 'GRAMMAR'
  return 'PRONUNCIATION'
}

const inferTargetWord = (
  questionType: ParsedQuizDraft['questionType'],
  prompt: string,
) => {
  if (questionType !== 'WORD_DISTINCTION' && questionType !== 'PRONUNCIATION')
    return ''
  const normalized = prompt.replace(/^\s*\[?\d+\]?\s*[：:．.、)\-]\s*/, '').trim()
  if (!normalized) return ''
  if (questionType === 'WORD_DISTINCTION') {
    const firstToken = normalized.split(/[\s　]/)[0] || normalized
    return firstToken
  }
  return ''
}

const parseOptionLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return null

  const digit = line.match(/^([1-4])[．.、)\s]+([\s\S]*)$/)
  if (digit) {
    return { index: Number(digit[1]) - 1, text: (digit[2] || '').trim() }
  }

  const circled = line.match(/^([①②③④])[ \t　]*([\s\S]*)$/)
  if (circled) {
    return {
      index: CIRCLED_NUM_TO_INDEX[circled[1]],
      text: (circled[2] || '').trim(),
    }
  }

  const alpha = line.match(/^([A-Da-d])[．.、)\s]+([\s\S]*)$/)
  if (alpha) {
    return {
      index: alpha[1].toUpperCase().charCodeAt(0) - 65,
      text: (alpha[2] || '').trim(),
    }
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
    '①': 0,
    '②': 1,
    '③': 2,
    '④': 3,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
  }

  const markerRegex = /(^|[\s　])([1-4①②③④A-Da-d])[．.、，:：)\-]?\s*/g
  const markers: Array<{ start: number; end: number; index: number }> = []
  let match: RegExpExecArray | null

  while ((match = markerRegex.exec(line)) !== null) {
    const marker = match[2].toUpperCase()
    const mapped = markerToIndex[marker]
    if (mapped === undefined) continue
    const markerStart = match.index + match[1].length
    const markerEnd = markerRegex.lastIndex
    markers.push({ start: markerStart, end: markerEnd, index: mapped })
  }

  if (markers.length < 4) return null

  for (let i = 0; i <= markers.length - 4; i += 1) {
    const window = markers.slice(i, i + 4)
    const isSeq =
      window[0].index === 0 &&
      window[1].index === 1 &&
      window[2].index === 2 &&
      window[3].index === 3
    if (!isSeq) continue

    const prompt = line.slice(0, window[0].start).trim()
    const options = window.map((curr, idx) => {
      const next = window[idx + 1]
      const end = next ? next.start : line.length
      return line.slice(curr.end, end).trim()
    })
    if (options.every(Boolean)) {
      return { prompt, options }
    }
  }

  return null
}

const parseQuestionHeaderLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return { isHeader: false, text: '' }

  const patterns = [
    // 1. / 1、 / 1， / 1) / （1）
    /^\s*[（(]?\d+[）)]?[．.、，:：)\-]\s*([\s\S]*)$/,
    // 第1题 / 第 1 問
    /^\s*第\s*\d+\s*[题題問]\s*[：:.\-、，]?\s*([\s\S]*)$/,
    // Q1 / Q1. / q1:
    /^\s*[Qq]\s*\d+\s*[：:.\-、，]?\s*([\s\S]*)$/,
  ]

  for (const pattern of patterns) {
    const matched = line.match(pattern)
    if (!matched) continue
    return { isHeader: true, text: (matched[1] || '').trim() }
  }
  return { isHeader: false, text: line }
}

const parseMultiQuizText = (input: string): ParsedQuizDraft[] => {
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')

  const results: ParsedQuizDraft[] = []
  let promptLines: string[] = []
  let options = ['', '', '', '']
  let seenOption = false
  let lastOptionIndex = -1

  const flushIfReady = () => {
    const prompt = promptLines.join('\n').trim()
    const normalizedOptions = options.map(item => item.trim())
    if (!normalizedOptions.every(Boolean)) return false
    const questionText = prompt
    const questionType = detectQuestionType(questionText, normalizedOptions)
    results.push({
      questionType,
      prompt: questionText,
      contextSentence: questionText,
      targetWord: inferTargetWord(questionType, questionText),
      explanation: '',
      options: normalizedOptions.map((text, idx) => ({
        text,
        isCorrect: idx === 0,
      })),
    })
    promptLines = []
    options = ['', '', '', '']
    seenOption = false
    lastOptionIndex = -1
    return true
  }

  const stripLooseQuestionNumber = (line: string) =>
    line.replace(/^\s*\d+\s+/, '').trim()

  const isLikelySentencePrompt = (text: string) => {
    if (!text) return false
    if (/[。！？.!?]$/.test(text)) return true
    return text.length >= 14
  }

  const isLooseNumberedPrompt = (line: string) => {
    if (!/^\s*\d+\s+/.test(line)) return false
    const loose = stripLooseQuestionNumber(line)
    return isLikelySentencePrompt(loose)
  }

  const isOnlyQuestionSerial = (text: string) =>
    /^\s*\[?\d+\]?\s*[：:．.、)\-]?\s*$/.test(text)

  const shouldTreatAsQuestionHeader = (line: string, lineIndex: number) => {
    const header = parseQuestionHeaderLine(line)
    const option = parseOptionLine(line)
    if (header.isHeader && (!option || option.index !== 0)) {
      return { isHeader: true, text: header.text }
    }

    if (!option || option.index !== 0) {
      return { isHeader: false, text: '' }
    }

    // “1. xxx” 既可能是题号，也可能是选项 1：
    // 如果下一条有效行是选项 2，则当前行优先判为选项 1，不判题号。
    let nextOptionIndex: number | null = null
    for (let i = lineIndex + 1; i < lines.length; i += 1) {
      const nextLine = lines[i].trim()
      if (!nextLine) continue
      const nextOption = parseOptionLine(nextLine)
      if (nextOption) nextOptionIndex = nextOption.index
      break
    }

    // 当前行和下一行都以“1”开头时，当前行通常是“题号+题干”。
    if (nextOptionIndex === 0) {
      const loose = stripLooseQuestionNumber(line)
      return { isHeader: true, text: loose || header.text || line.trim() }
    }

    if (nextOptionIndex === 1) {
      return { isHeader: false, text: '' }
    }

    const loose = stripLooseQuestionNumber(line)
    if (isLikelySentencePrompt(loose)) {
      return { isHeader: true, text: loose }
    }

    if (header.isHeader) {
      return { isHeader: true, text: header.text }
    }

    return { isHeader: false, text: '' }
  }

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim()
    if (!line) {
      flushIfReady()
      return
    }

    // 支持“题干 + 1/2/3/4 选项同一行”
    const inlineSet = parseInlineOptionSet(line)
    if (inlineSet) {
      if (inlineSet.prompt) {
        // 行内选项前只出现“题号”时，不把题号当题干。
        if (!isOnlyQuestionSerial(inlineSet.prompt)) {
          if (!seenOption && promptLines.length === 0) {
            const header = parseQuestionHeaderLine(inlineSet.prompt)
            promptLines.push(header.isHeader ? header.text : inlineSet.prompt)
          } else {
            promptLines.push(inlineSet.prompt)
          }
        }
      }
      const questionText = promptLines.join('\n').trim() || inlineSet.prompt
      const questionType = detectQuestionType(questionText, inlineSet.options)
      results.push({
        questionType,
        prompt: questionText,
        contextSentence: questionText,
        targetWord: inferTargetWord(questionType, questionText),
        explanation: '',
        options: inlineSet.options.map((text, idx) => ({
          text,
          isCorrect: idx === 0,
        })),
      })
      promptLines = []
      options = ['', '', '', '']
      seenOption = false
      lastOptionIndex = -1
      return
    }

    // 选项阶段遇到“数字+空格+完整句子”时，判定为下一题题干，先结算上一题。
    if (seenOption && isLooseNumberedPrompt(line)) {
      const flushed = flushIfReady()
      if (!flushed) {
        promptLines = []
        options = ['', '', '', '']
        seenOption = false
        lastOptionIndex = -1
      }
      promptLines.push(stripLooseQuestionNumber(line))
      return
    }

    // 优先处理题干前缀（如 1. / 2、 / 第3题 / Q4），避免误判为选项。
    if (!seenOption && promptLines.length === 0) {
      if (isLooseNumberedPrompt(line)) {
        promptLines.push(stripLooseQuestionNumber(line))
        return
      }
      const header = shouldTreatAsQuestionHeader(line, lineIndex)
      if (header.isHeader) {
        if (header.text) promptLines.push(header.text)
        return
      }
    }

    const optionLine = parseOptionLine(line)
    if (optionLine) {
      seenOption = true
      lastOptionIndex = optionLine.index
      options[optionLine.index] = optionLine.text
      if (options.every(item => item.trim().length > 0)) {
        flushIfReady()
      }
      return
    }

    if (!seenOption) {
      promptLines.push(line)
      return
    }

    if (lastOptionIndex >= 0 && lastOptionIndex < options.length) {
      options[lastOptionIndex] = `${options[lastOptionIndex]} ${line}`.trim()
    }
  })

  flushIfReady()
  return results
}

function PanelDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const label = options.find(item => item.value === value)?.label || placeholder

  return (
    <div ref={wrapRef} className='relative w-full'>
      <button
        type='button'
        onClick={() => setOpen(prev => !prev)}
        className={`flex w-full items-center justify-between border px-4 py-3 text-sm font-semibold transition ${
          open
            ? 'border-indigo-300 bg-white text-gray-800 ring-2 ring-indigo-100'
            : 'border-indigo-200 bg-white text-gray-700 hover:bg-indigo-50/30'
        }`}>
        <span className='truncate pr-3'>{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180 text-indigo-500' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </button>
      {open && (
        <div className='absolute z-[90] mt-2 max-h-80 w-full overflow-y-auto border border-gray-100 bg-white py-1.5 '>
          {options.length === 0 ? (
            <div className='px-4 py-3 text-sm text-gray-400'>暂无选项</div>
          ) : (
            options.map(item => (
              <button
                key={item.value}
                type='button'
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
                className={`block w-full truncate px-4 py-2.5 text-left text-sm font-semibold transition ${
                  value === item.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}>
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadCenterUI({ dbLevels, dbCategories }: Props) {
  const dialog = useDialog()
  const [localCategories, setLocalCategories] = useState(dbCategories)
  const [activeTab, setActiveTab] = useState<'audio' | 'article' | 'quiz'>(
    'audio',
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- 文章表单状态 ---
  const [articleForm, setArticleForm] = useState({
    categoryId: dbCategories[0]?.id || '',
    title: '',
    description: '',
    content: '',
  })
  const [articleQuestions, setArticleQuestions] = useState<any[]>([])
  const [articleQuickInput, setArticleQuickInput] = useState('')
  const [articleParsedPreviewRows, setArticleParsedPreviewRows] = useState<
    ArticlePreviewRow[]
  >([])
  const [articleParsedDrafts, setArticleParsedDrafts] = useState<
    ArticleImportedQuestionDraft[]
  >([])

  // 🌟 1. 新增：绑定文章输入框的 Ref
  const articleTextareaRef = useRef<HTMLTextAreaElement>(null)

  const [quizForm, setQuizForm] = useState({
    categoryId: dbCategories[0]?.id || '',
    questionType: 'PRONUNCIATION',
    contextSentence: '',
    targetWord: '',
    prompt: '',
    explanation: '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  })
  const [quickInput, setQuickInput] = useState('')
  const [bulkQuickInput, setBulkQuickInput] = useState('')
  const [bulkParsedQuestions, setBulkParsedQuestions] = useState<
    ParsedQuizDraft[]
  >([])
  const [bulkEditingIndex, setBulkEditingIndex] = useState(0)
  const [sortSequence, setSortSequence] = useState<number[]>([])
  const quizContextTextareaRef = useRef<HTMLTextAreaElement>(null)
  const bulkContextTextareaRef = useRef<HTMLTextAreaElement>(null)

  const isSentenceBoundaryAt = (text: string, index: number) => {
    const ch = text[index]
    if (!ch) return false
    if (ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?')
      return true
    if (ch === '.') {
      const prev = text[index - 1] || ''
      const next = text[index + 1] || ''
      if (/\d/.test(prev) && /\d/.test(next)) return false
      return true
    }
    return false
  }

  const extractSentenceAroundIndex = (
    text: string,
    anchorIndex: number,
    anchorLength = 0,
  ) => {
    if (!text) return ''
    const safeIndex = Math.max(0, Math.min(anchorIndex, text.length - 1))
    let sentenceStart = 0
    for (let i = safeIndex - 1; i >= 0; i -= 1) {
      if (isSentenceBoundaryAt(text, i)) {
        sentenceStart = i + 1
        break
      }
    }
    let sentenceEnd = text.length
    for (let i = safeIndex + Math.max(1, anchorLength); i < text.length; i += 1) {
      if (isSentenceBoundaryAt(text, i)) {
        sentenceEnd = i + 1
        break
      }
    }
    const sentence = text.substring(sentenceStart, sentenceEnd).trim()
    if (!sentence) return ''

    // 兜底：如果异常跨了多句，只保留第一个完整句。
    const parts = sentence
      .split(/(?<=[。！？!?])/)
      .map(item => item.trim())
      .filter(Boolean)
    if (parts.length <= 1) return sentence
    return parts[0]
  }

  const fillBlankTokenRegex =
    /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/

  const rebuildFillBlankPromptFromQuestion = (question: any) => {
    if (!question || question.questionType !== 'FILL_BLANK') return question
    const correctText =
      question.options?.find((opt: any) => opt?.isCorrect)?.text?.trim() || ''
    const context = (question.contextSentence || '').trim()
    if (!context) return question
    if (!fillBlankTokenRegex.test(context) || !correctText) return question
    return {
      ...question,
      prompt: context.replace(fillBlankTokenRegex, correctText),
    }
  }

  // ================= 🌟 2. 新增：划词一键生成填空题引擎 =================
  const handleMakeBlank = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if (start === end) {
      void dialog.alert('请先在正文中划选你想挖空的词。')
      return
    }

    const fullText = textarea.value
    const selectedWord = fullText.substring(start, end).trim()

    // 精准截取包含该词的“单句”（不跨句）
    const contextSentence = extractSentenceAroundIndex(
      fullText,
      start,
      Math.max(1, end - start),
    )

    // 自动创建新题目
    const newQuestion = {
      questionType: 'FILL_BLANK',
      prompt: contextSentence, // 🌟 直接用原句作为锚点，配合前台的精准挖空引擎！
      contextSentence: contextSentence,
      explanation: '',
      options: [
        { text: selectedWord, isCorrect: true }, // 🌟 选中的词自动变成正确选项
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ],
    }

    setArticleQuestions(prev => [...prev, newQuestion])

    // 取消选中状态，方便继续选下一个词
    textarea.selectionStart = textarea.selectionEnd
    textarea.focus()
  }

  // ================= 🌟 3. 新增：单题专属的选项解析魔法 =================
  const handleParseCardOptions = (qIndex: number, text: string) => {
    if (!text.trim()) return

    // 专属的正则表达式，只提取选项，不提取题干
    const regex =
      /(?:1[．.\s]|①|１[．.\s])([\s\S]*?)(?:2[．.\s]|②|２[．.\s])([\s\S]*?)(?:3[．.\s]|③|３[．.\s])([\s\S]*?)(?:4[．.\s]|④|４[．.\s])([\s\S]*)/i
    const match = text.match(regex)

    if (match) {
      const newOptionsTexts = [
        match[1].trim(),
        match[2].trim(),
        match[3].trim(),
        match[4].trim(),
      ]

      const newQs = [...articleQuestions]

      // 🌟 自动寻的魔法：寻找哪个新选项包含了我们刚才“划词”选中的正确答案
      const currentCorrectOpt = newQs[qIndex].options.find(
        (o: any) => o.isCorrect,
      )
      const correctText = currentCorrectOpt ? currentCorrectOpt.text : ''

      let newCorrectIdx = newOptionsTexts.findIndex(
        t =>
          t === correctText ||
          t.includes(correctText) ||
          correctText.includes(t),
      )
      if (newCorrectIdx === -1) newCorrectIdx = 0 // 如果找不到完美匹配，兜底选第1个

      // 覆盖更新这道题的 4 个选项
      newQs[qIndex].options = newOptionsTexts.map((txt, idx) => ({
        text: txt,
        isCorrect: idx === newCorrectIdx,
      }))
      newQs[qIndex] = rebuildFillBlankPromptFromQuestion(newQs[qIndex])

      setArticleQuestions(newQs)
    } else {
      void dialog.alert('解析失败：未识别到 1. 2. 3. 4. 选项格式。')
    }
  }
  // ================= 提交处理 =================
  const buildArticleQuestionsFromQuickInput = (input: string) => {
    const parsed = parseMultiQuizText(input)
    if (parsed.length === 0) {
      return {
        drafts: [] as ArticleImportedQuestionDraft[],
        previewRows: [] as ArticlePreviewRow[],
      }
    }
    const normalizeAsciiDigit = (value: string) =>
      value.replace(/[０-９]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
      )

    const extractSerialNumber = (rawPrompt: string) => {
      const normalized = normalizeAsciiDigit(rawPrompt.trim())
      const direct = normalized.match(
        /^[\[［(（【「『]\s*(\d+)\s*[\]］)）】」』]$/,
      )
      if (direct) return direct[1]
      const inlineBracket = normalized.match(
        /[\[［(（【「『]\s*(\d+)\s*[\]］)）】」』]/,
      )
      if (inlineBracket) return inlineBracket[1]
      const loose = normalized.match(/^(?:第\s*)?(\d+)(?:\s*[题題問])?\s*$/)
      if (loose) return loose[1]
      const prefix = normalized.match(/^(?:第\s*)?(\d+)\s*[：:．.、)\-]/)
      if (prefix) return prefix[1]
      const fallbackDigits = normalized.match(/(\d{1,4})/)
      if (fallbackDigits) return fallbackDigits[1]
      return ''
    }

    const findPlaceholderTokenBySerial = (
      content: string,
      serialNumber: string,
    ): { token: string; index: number; matchCount: number } => {
      if (!content || !serialNumber) return { token: '', index: -1, matchCount: 0 }
      const normalizedContent = normalizeAsciiDigit(content)
      const escaped = serialNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const tokenCountPattern = new RegExp(
        `[\\[［(（【「『]\\s*${escaped}\\s*[\\]］)）】」』]`,
        'g',
      )
      const matchCount = [...normalizedContent.matchAll(tokenCountPattern)].length
      const patterns = [
        new RegExp(`[\\[［(（【「『]\\s*${escaped}\\s*[\\]］)）】」』]`),
        new RegExp(`第\\s*${escaped}\\s*[题題問]`),
        new RegExp(`(^|\\D)${escaped}(\\D|$)`),
      ]
      for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
        const pattern = patterns[patternIndex]
        const matched = pattern.exec(normalizedContent)
        if (matched?.[0]) {
          const raw = matched[0]
          const pureDigits = raw.match(/\d+/)?.[0] || ''
          const pure = pureDigits || raw.replace(/^\D/, '').replace(/\D$/, '')
          if (pure === serialNumber) {
            if (patternIndex < 2) {
              return {
                token: content.slice(matched.index, matched.index + raw.length),
                index: matched.index,
                matchCount,
              }
            }
            const digitStartOffset = raw.search(/\d/)
            const start = matched.index + Math.max(0, digitStartOffset)
            const end = start + serialNumber.length
            return {
              token: content.slice(start, end),
              index: start,
              matchCount,
            }
          }
        }
      }
      return { token: '', index: -1, matchCount }
    }

    const replaceBlankWithAnswer = (sentence: string, answer: string) => {
      const blankRegex =
        /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/
      if (!answer || !sentence) return sentence
      if (!blankRegex.test(sentence)) return sentence
      return sentence.replace(blankRegex, answer)
    }

    const newQuestions = parsed.map(item => {
      const promptText = (item.prompt || '').trim()
      // 仅去掉“题号前缀”，保留填空占位符 [12]
      const normalizedPrompt = promptText.replace(
        /^\s*(?:第\s*)?\d+\s*[：:．.、)\-]\s*/,
        '',
      )
      const correctOption = item.options.find(opt => opt.isCorrect)?.text?.trim() || ''
      const promptPlaceholder =
        normalizeAsciiDigit(normalizedPrompt).match(
          /[\[［(（【「『]\s*(\d+)\s*[\]］)）】」』]/,
        )?.[1] || ''
      const serialNumber = promptPlaceholder || extractSerialNumber(promptText)
      const placeholderHit = findPlaceholderTokenBySerial(
        articleForm.content || '',
        serialNumber,
      )
      const matchedToken = placeholderHit.token
      const matchedSentence =
        matchedToken && articleForm.content && placeholderHit.index >= 0
          ? extractSentenceAroundIndex(
              articleForm.content,
              placeholderHit.index,
              Math.max(matchedToken.length, serialNumber.length, 1),
            )
          : ''

      const detectedType =
        /[（(][\s　]*[）)]|__{2,}|～|\[\d+\]/.test(normalizedPrompt) ||
        Boolean(matchedToken)
          ? 'FILL_BLANK'
          : 'READING_COMPREHENSION'

      const resolvedContextSentence =
        detectedType === 'FILL_BLANK'
          ? matchedSentence || normalizedPrompt
          : normalizedPrompt

      // 填空题题干统一存“已填入正确答案的完整句”，避免前台出现系统自动题干。
      const resolvedPrompt =
        detectedType === 'FILL_BLANK'
          ? (() => {
              if (
                matchedToken &&
                resolvedContextSentence.includes(matchedToken) &&
                correctOption
              ) {
                return resolvedContextSentence.replace(
                  matchedToken,
                  correctOption,
                )
              }
              const localPlaceholder = normalizedPrompt.match(/\[\d+\]/)?.[0]
              const localAnyBracketPlaceholder =
                normalizedPrompt.match(
                  /[\[［(（【「『]\s*\d+\s*[\]］)）】」』]/,
                )?.[0] || ''
              if (
                localPlaceholder &&
                resolvedContextSentence.includes(localPlaceholder) &&
                correctOption
              ) {
                return resolvedContextSentence.replace(
                  localPlaceholder,
                  correctOption,
                )
              }
              if (
                localAnyBracketPlaceholder &&
                resolvedContextSentence.includes(localAnyBracketPlaceholder) &&
                correctOption
              ) {
                return resolvedContextSentence.replace(
                  localAnyBracketPlaceholder,
                  correctOption,
                )
              }
              return replaceBlankWithAnswer(resolvedContextSentence, correctOption)
            })()
          : normalizedPrompt
      return {
        questionType: detectedType,
        prompt: /^\s*\d+\s*$/.test(resolvedPrompt) ? '' : resolvedPrompt,
        contextSentence: resolvedContextSentence,
        explanation: '',
        options: item.options.map((opt, index) => ({
          text: opt.text,
          isCorrect: index === 0,
        })),
        __previewSerial: serialNumber || '',
        __previewToken: matchedToken || '',
        __previewDuplicateToken: placeholderHit.matchCount > 1,
      }
    })

    const previewRows: ArticlePreviewRow[] = newQuestions.map((question, idx) => ({
      serial: question.__previewSerial || `${idx + 1}`,
      placeholderToken: question.__previewToken || '未命中',
      generatedPrompt: question.prompt || '（空题干）',
      isDuplicateToken: Boolean(question.__previewDuplicateToken),
    }))

    const drafts = newQuestions.map(question => {
      const { __previewSerial, ...rest } = question
      return rest
    })

    return { drafts, previewRows }
  }

  const handleArticleAddQuestion = () => {
    if (!articleQuickInput.trim()) return

    const { drafts, previewRows } = buildArticleQuestionsFromQuickInput(
      articleQuickInput,
    )
    if (drafts.length === 0) {
      void dialog.alert('解析失败，请检查是否包含 1. 2. 3. 4. 四个选项。')
      return
    }

    setArticleParsedDrafts(drafts)
    setArticleParsedPreviewRows(previewRows)
    dialog.toast(`已识别 ${drafts.length} 道题，请先确认预览`, {
      tone: 'success',
    })
  }

  const handleConfirmArticlePreviewImport = () => {
    if (articleParsedDrafts.length === 0) return
    if (articleParsedPreviewRows.some(row => row.isDuplicateToken)) {
      void dialog.alert('检测到重号占位符，请先修正文中的重复编号后再导入。')
      return
    }
    const blankTokenRegex =
      /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/

    const importedStartIndex = articleQuestions.length
    let nextContent = articleForm.content
    const normalizedDrafts = articleParsedDrafts.map((draft, idx) => {
      if (draft.questionType !== 'FILL_BLANK') {
        const { __previewToken, __previewDuplicateToken, ...rest } = draft
        return rest
      }
      const sequenceNo = importedStartIndex + idx + 1
      const nextToken = `[${sequenceNo}]`
      const correctText =
        draft.options.find(option => option.isCorrect)?.text?.trim() || ''
      const matchedToken = (draft.__previewToken || '').trim()

      if (matchedToken && nextContent.includes(matchedToken)) {
        nextContent = nextContent.replace(matchedToken, nextToken)
      }

      let nextContextSentence = (draft.contextSentence || '').trim()
      if (matchedToken && nextContextSentence.includes(matchedToken)) {
        nextContextSentence = nextContextSentence.replace(matchedToken, nextToken)
      } else if (blankTokenRegex.test(nextContextSentence)) {
        nextContextSentence = nextContextSentence.replace(blankTokenRegex, nextToken)
      }

      const nextPrompt =
        correctText && blankTokenRegex.test(nextContextSentence)
          ? nextContextSentence.replace(blankTokenRegex, correctText)
          : draft.prompt

      const { __previewToken, __previewDuplicateToken, ...rest } = draft
      return {
        ...rest,
        contextSentence: nextContextSentence,
        prompt: nextPrompt,
      }
    })

    setArticleForm(prev => ({ ...prev, content: nextContent }))
    setArticleQuestions(prev => [...prev, ...normalizedDrafts])
    setArticleQuickInput('')
    setArticleParsedDrafts([])
    setArticleParsedPreviewRows([])
    dialog.toast(`已导入 ${articleParsedDrafts.length} 道阅读题`, {
      tone: 'success',
    })
  }

  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const res = await createArticle({
      ...articleForm,
      questions: articleQuestions,
    })
    await dialog.alert(res.message)
    if (res.success) {
      setArticleForm(prev => ({
        ...prev,
        title: '',
        description: '',
        content: '',
      }))
      setArticleQuestions([])
    }
    setIsSubmitting(false)
  }

  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const promptText = quizForm.prompt.trim()
    const contextText = quizForm.contextSentence.trim()
    if (!promptText && !contextText) {
      await dialog.alert(
        '请先填写题目内容再保存。\n可选方式：\n1) 使用“快速粘贴（推荐）”自动解析\n2) 在“题目呈现”填写题干\n3) 在“语境句”填写完整句子',
      )
      return
    }
    setIsSubmitting(true)
    const res = await createQuizQuestion(quizForm)
    await dialog.alert(res.message)
    if (res.success) {
      setQuickInput('')
      setQuizForm(prev => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        prompt: '',
        explanation: '',
        options: prev.options.map((o, i) => ({ text: '', isCorrect: i === 0 })),
      }))
    }
    setIsSubmitting(false)
  }

  const handleQuickParse = (text: string) => {
    setQuickInput(text)
    if (!text.trim()) return

    const regex =
      /([\s\S]*?)(?:1[．.\s]|①|１[．.\s])([\s\S]*?)(?:2[．.\s]|②|２[．.\s])([\s\S]*?)(?:3[．.\s]|③|３[．.\s])([\s\S]*?)(?:4[．.\s]|④|４[．.\s])([\s\S]*)/i
    const match = text.match(regex)

    if (match) {
      const questionText = match[1].trim()
      const detectedType = detectQuestionType(questionText, [
        match[2].trim(),
        match[3].trim(),
        match[4].trim(),
        match[5].trim(),
      ])
      const inferredTargetWord = inferTargetWord(detectedType, questionText)

      setSortSequence([])
      setQuizForm(prev => ({
        ...prev,
        questionType: detectedType,
        prompt: questionText,
        contextSentence: questionText,
        targetWord: inferredTargetWord,
        options: [
          { text: match[2].trim(), isCorrect: prev.options[0].isCorrect },
          { text: match[3].trim(), isCorrect: prev.options[1].isCorrect },
          { text: match[4].trim(), isCorrect: prev.options[2].isCorrect },
          { text: match[5].trim(), isCorrect: prev.options[3].isCorrect },
        ],
      }))
    }
  }

  const handleBulkQuickParse = () => {
    const parsed = parseMultiQuizText(bulkQuickInput)
    setBulkParsedQuestions(parsed)
    if (parsed.length === 0) {
      void dialog.alert('未识别到完整题目。请检查是否包含每题 4 个选项。')
      return
    }
    // 同步首题到单题编辑区，方便立刻校对
    setQuizForm(prev => ({
      ...prev,
      questionType: parsed[0].questionType,
      prompt: parsed[0].prompt,
      contextSentence: parsed[0].contextSentence,
      targetWord: parsed[0].targetWord || '',
      explanation: parsed[0].explanation,
      options: parsed[0].options,
    }))
    setBulkEditingIndex(0)
    dialog.toast(`已识别 ${parsed.length} 题`, { tone: 'success' })
  }

  const handleBulkPromptChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index
          ? { ...item, prompt: value, contextSentence: value || item.contextSentence }
          : item,
      ),
    )
  }

  const handleBulkContextSentenceChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, contextSentence: value } : item,
      ),
    )
  }

  const handleBulkTargetWordChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, targetWord: value.trim() } : item,
      ),
    )
  }

  const handleBulkPickTargetWordFromSelection = () => {
    const textarea = bulkContextTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      void dialog.alert('请先在当前题的语境句中划选目标词。')
      return
    }
    const selected = textarea.value.slice(start, end).trim()
    if (!selected) return
    handleBulkTargetWordChange(bulkEditingIndex, selected)
    dialog.toast(`已设置第 ${bulkEditingIndex + 1} 题目标词：${selected}`, {
      tone: 'success',
    })
  }

  const handleBulkOptionTextChange = (
    qIndex: number,
    optionIndex: number,
    value: string,
  ) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => {
        if (i !== qIndex) return item
        return {
          ...item,
          options: item.options.map((opt, idx) =>
            idx === optionIndex ? { ...opt, text: value } : opt,
          ),
        }
      }),
    )
  }

  const setBulkCorrectOption = (qIndex: number, optionIndex: number) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => {
        if (i !== qIndex) return item
        return {
          ...item,
          options: item.options.map((opt, idx) => ({
            ...opt,
            isCorrect: idx === optionIndex,
          })),
        }
      }),
    )
  }

  const handleBulkQuestionTypeChange = (
    qIndex: number,
    questionType: ParsedQuizDraft['questionType'],
  ) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => (i === qIndex ? { ...item, questionType } : item)),
    )
  }

  const handleBulkRemoveQuestion = (qIndex: number) => {
    setBulkParsedQuestions(prev => {
      const next = prev.filter((_, i) => i !== qIndex)
      setBulkEditingIndex(current => {
        if (next.length === 0) return 0
        if (qIndex < current) return current - 1
        if (qIndex === current) return Math.min(current, next.length - 1)
        return current
      })
      return next
    })
  }

  const handleBulkQuizSave = async () => {
    if (bulkParsedQuestions.length === 0) {
      await dialog.alert('请先点击“识别多题”。')
      return
    }
    if (!quizForm.categoryId) {
      await dialog.alert('请先选择所属分类。')
      return
    }

    setIsSubmitting(true)
    let successCount = 0
    const failed: Array<{ index: number; message: string }> = []

    for (let i = 0; i < bulkParsedQuestions.length; i += 1) {
      const draft = bulkParsedQuestions[i]
      const res = await createQuizQuestion({
        categoryId: quizForm.categoryId,
        questionType: draft.questionType,
        contextSentence: draft.contextSentence,
        targetWord: draft.targetWord || '',
        prompt: draft.prompt,
        explanation: draft.explanation,
        options: draft.options,
      })
      if (res.success) {
        successCount += 1
      } else {
        failed.push({ index: i + 1, message: res.message || '保存失败' })
      }
    }

    setIsSubmitting(false)

    if (failed.length === 0) {
      setBulkQuickInput('')
      setBulkParsedQuestions([])
      setQuickInput('')
      setQuizForm(prev => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        prompt: '',
        explanation: '',
        options: prev.options.map((o, idx) => ({ text: '', isCorrect: idx === 0 })),
      }))
      await dialog.alert(`批量保存成功，共 ${successCount} 题。`)
      return
    }

    const preview = failed
      .slice(0, 5)
      .map(item => `第 ${item.index} 题：${item.message}`)
      .join('\n')
    await dialog.alert(
      `已保存 ${successCount} 题，失败 ${failed.length} 题。\n${preview}${failed.length > 5 ? '\n…' : ''}`,
    )
  }

  const setCorrectOption = (index: number) => {
    setQuizForm(prev => {
      const newOptions = prev.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      }))
      let newContextSentence = prev.contextSentence

      if (prev.questionType === 'FILL_BLANK') {
        const blankRegex = /[（(][\s　]*[）)]|__{2,}|～/
        if (blankRegex.test(prev.prompt)) {
          newContextSentence = prev.prompt.replace(
            blankRegex,
            newOptions[index].text,
          )
        }
      }
      return {
        ...prev,
        options: newOptions,
        contextSentence: newContextSentence,
      }
    })
  }

  const handleSortClick = (index: number) => {
    if (sortSequence.includes(index)) return
    const newSeq = [...sortSequence, index]
    setSortSequence(newSeq)

    if (newSeq.length === 4) {
      setQuizForm(prev => {
        const parts = prev.prompt.split(/([＿_]{2,}|[★＊])/).filter(Boolean)
        let slotCount = 0
        let starSlotIndex = -1

        parts.forEach(part => {
          if (/[＿_]{2,}|[★＊]/.test(part)) {
            if (/[★＊]/.test(part)) starSlotIndex = slotCount
            slotCount++
          }
        })
        if (starSlotIndex === -1) starSlotIndex = 0

        const correctOptionIndex = newSeq[starSlotIndex]
        const newOptions = prev.options.map((opt, i) => ({
          ...opt,
          isCorrect: i === correctOptionIndex,
        }))
        const joinedOptionsText = newSeq
          .map(idx => prev.options[idx].text)
          .join('')

        const blankAreaRegex = /[＿_★＊][＿_★＊\s　]+[＿_★＊]/
        let newContextSentence = prev.prompt

        if (blankAreaRegex.test(prev.prompt)) {
          newContextSentence = prev.prompt.replace(
            blankAreaRegex,
            joinedOptionsText,
          )
        } else {
          newContextSentence = prev.prompt
            .replace(/[★＊]/, joinedOptionsText)
            .replace(/[＿_]{2,}/g, '')
        }

        return {
          ...prev,
          options: newOptions,
          contextSentence: newContextSentence,
        }
      })
    }
  }
  const quizHasQuestionContent =
    quizForm.prompt.trim().length > 0 || quizForm.contextSentence.trim().length > 0

  const renderTargetWordPreview = (sentence: string, targetWord: string) => {
    if (!targetWord || !sentence.includes(targetWord)) return sentence || '（语境句预览）'
    const index = sentence.indexOf(targetWord)
    const before = sentence.slice(0, index)
    const after = sentence.slice(index + targetWord.length)
    return (
      <>
        {before}
        <span className='border-b-2 border-indigo-500 font-semibold text-indigo-700'>
          {targetWord}
        </span>
        {after}
      </>
    )
  }

  const handlePickTargetWordFromSelection = () => {
    const textarea = quizContextTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      void dialog.alert('请先在“语境句”中用鼠标划选一个目标词。')
      return
    }
    const selected = textarea.value.slice(start, end).trim()
    if (!selected) return
    setQuizForm(prev => ({ ...prev, targetWord: selected }))
    dialog.toast(`已设置目标词：${selected}`, { tone: 'success' })
  }

  const CategorySelector = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (val: string) => void
  }) => {
    const [isCreating, setIsCreating] = useState(false)
    const [newCatData, setNewCatData] = useState({
      levelId: dbLevels[0]?.id || '',
      name: '',
    })
    const [isSavingCat, setIsSavingCat] = useState(false)

    const handleSaveCategory = async () => {
      if (!newCatData.name.trim()) {
        await dialog.alert('试卷名称不能为空。')
        return
      }
      setIsSavingCat(true)

      const res = await createCategory(newCatData)
      if (res.success && res.category) {
        setLocalCategories(prev => [res.category, ...prev])
        onChange(res.category.id)
        setIsCreating(false)
        setNewCatData({ ...newCatData, name: '' })
      } else {
        await dialog.alert(res.message || '创建失败')
      }
      setIsSavingCat(false)
    }

    return (
      <div className='mb-6 border border-indigo-100 bg-indigo-50/40 p-4 md:p-5 transition-all duration-300'>
        <div className='flex justify-between items-center mb-3'>
          <label className='block text-sm font-bold text-indigo-900'>
            所属分类
          </label>
          <button
            type='button'
            onClick={() => setIsCreating(!isCreating)}
            className='border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-800'>
            {isCreating ? '取消新建' : '新建分类'}
          </button>
        </div>

        {!isCreating ? (
          <PanelDropdown
            value={value}
            onChange={onChange}
            options={localCategories.map(cat => ({
              value: cat.id,
              label: `${cat.level?.title ?? ''} · ${cat.name}`,
            }))}
            placeholder='无可用分类，请先新建'
          />
        ) : (
          <div className='animate-in slide-in-from-top-2 flex flex-col gap-3 border border-indigo-200 bg-white p-4 fade-in'>
            <div className='flex flex-col gap-2 md:flex-row md:gap-3'>
              <div className='w-full md:w-1/3'>
                <PanelDropdown
                  value={newCatData.levelId}
                  onChange={val => setNewCatData({ ...newCatData, levelId: val })}
                  options={dbLevels.map((lvl: any) => ({
                    value: lvl.id,
                    label: lvl.title,
                  }))}
                  placeholder='选择等级'
                />
              </div>
              <input
                type='text'
                value={newCatData.name}
                onChange={e =>
                  setNewCatData({ ...newCatData, name: e.target.value })
                }
                placeholder='分类名称，例如：2025-07 N1 真题'
                className='flex-1 border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>
            <button
              type='button'
              onClick={handleSaveCategory}
              disabled={isSavingCat}
              className='w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2.5 transition-colors text-sm disabled:opacity-50'>
              {isSavingCat ? '创建中...' : '确认创建并使用'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 p-3 md:p-12'>
      <div className='mx-auto max-w-5xl'>
        <h1 className='mb-5 text-2xl font-bold text-gray-800 md:mb-8 md:text-3xl'>
          内容录入中心
        </h1>

        <div className='mb-5 grid grid-cols-1 gap-2 border border-gray-200 bg-white p-1.5 sm:grid-cols-3 md:mb-8'>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'audio' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            听力语料
          </button>
          <button
            onClick={() => setActiveTab('article')}
            className={`px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'article' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            阅读录入
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'quiz' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            题库录入
          </button>
        </div>

        {activeTab === 'audio' && (
          <div className='animate-in slide-in-from-bottom-4 border border-gray-100 bg-white p-4 fade-in duration-500 md:p-8'>
            <h2 className='mb-2 text-lg font-bold md:text-xl'>录入听力语料</h2>
            <p className='mb-4 text-sm text-gray-500 md:mb-6'>
              选择分类并上传字幕。支持手动路径、站内浏览或本地上传录音，提交后将自动保存并入库。
            </p>
            <UploadForm levels={dbLevels} categories={dbCategories} />
          </div>
        )}

        {activeTab === 'article' && (
          <form
            onSubmit={handleArticleSubmit}
            className='animate-in space-y-8 border border-gray-100 bg-white p-5 fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
            <div className='space-y-1'>
              <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
                阅读内容录入
              </h2>
              <p className='text-sm text-gray-500'>
                先录入文章正文，再按需补充阅读题并保存。
              </p>
            </div>

            <section className='space-y-5 border border-gray-200 bg-gray-50/30 p-4 md:p-5'>
              <CategorySelector
                value={articleForm.categoryId}
                onChange={val =>
                  setArticleForm({ ...articleForm, categoryId: val })
                }
              />

              <div>
                <label className='block text-sm font-bold text-gray-700 mb-2'>
                  文章标题
                </label>
                <input
                  type='text'
                  value={articleForm.title}
                  onChange={e =>
                    setArticleForm({ ...articleForm, title: e.target.value })
                  }
                  className='w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none'
                  placeholder='例如：2023 年 7 月 N1 阅读（可留空）'
                />
              </div>

              <div>
                <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                  <label className='text-sm font-bold text-gray-700'>
                    正文内容
                    <span className='ml-2 text-xs font-normal text-gray-400'>
                      建议粘贴纯文本
                    </span>
                  </label>
                  <button
                    type='button'
                    onClick={handleMakeBlank}
                    className='inline-flex items-center justify-center border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 transition-all hover:bg-indigo-100 active:scale-95'>
                    划词生成填空题
                  </button>
                </div>
                <textarea
                  required
                  ref={articleTextareaRef}
                  value={articleForm.content}
                  onChange={e =>
                    setArticleForm({ ...articleForm, content: e.target.value })
                  }
                  rows={10}
                  className='w-full p-5 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y'
                  placeholder='在此粘贴文章正文'
                />
              </div>
            </section>

            <section className='space-y-5 border border-indigo-100 bg-indigo-50/40 p-4 md:p-5'>
              <div>
                <h3 className='text-base font-black text-indigo-900 md:text-lg'>
                  阅读题（可选）
                </h3>
                <p className='mt-1 text-xs text-indigo-700'>
                  可通过划词自动生成，也可粘贴 1.2.3.4 格式快速导入。
                </p>
              </div>

              {articleQuestions.length > 0 && (
                <div className='mb-6 space-y-4'>
                  {articleQuestions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      className='bg-white p-4 border border-indigo-100 relative transition-all'>
                      <button
                        type='button'
                        onClick={async () => {
                          const confirmed = await dialog.confirm(
                            `确认移除第 ${qIndex + 1} 题吗？`,
                            {
                              title: '移除题目',
                              confirmText: '移除',
                              danger: true,
                            },
                          )
                          if (!confirmed) return
                          setArticleQuestions(prev =>
                            prev.filter((_, i) => i !== qIndex),
                          )
                        }}
                        className='absolute right-4 top-4 border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700'>
                        移除题目
                      </button>

                      <div className='mb-3 pr-16 text-sm font-bold text-indigo-900'>
                        第 {qIndex + 1} 题：
                        {q.questionType === 'FILL_BLANK' ? (
                          <span className='ml-2 rounded bg-indigo-50 px-2 py-0.5 text-xs font-normal text-indigo-600'>
                            填空题
                          </span>
                        ) : null}
                        <div className='mt-2 text-gray-700 font-medium leading-relaxed bg-gray-50 p-2 border border-gray-100'>
                          {q.prompt}
                        </div>
                      </div>

                      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        {q.options.map((opt: any, optIndex: number) => (
                          <div
                            key={optIndex}
                            className='flex min-w-0 items-center gap-2 border border-gray-200 bg-white px-2.5 py-2 text-sm'>
                            <input
                              type='radio'
                              checked={opt.isCorrect}
                              onChange={() => {
                                const newQs = [...articleQuestions]
                                newQs[qIndex].options.forEach(
                                  (o: any, i: number) =>
                                    (o.isCorrect = i === optIndex),
                                )
                                newQs[qIndex] = rebuildFillBlankPromptFromQuestion(
                                  newQs[qIndex],
                                )
                                setArticleQuestions(newQs)
                              }}
                              className='text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer'
                            />
                            <input
                              type='text'
                              value={opt.text}
                              onChange={e => {
                                const newQs = [...articleQuestions]
                                newQs[qIndex].options[optIndex].text =
                                  e.target.value
                                newQs[qIndex] = rebuildFillBlankPromptFromQuestion(
                                  newQs[qIndex],
                                )
                                setArticleQuestions(newQs)
                              }}
                              placeholder={`选项 ${optIndex + 1}`}
                              className={`min-w-0 flex-1 rounded-md border px-3 py-2 transition-colors ${opt.isCorrect ? 'border-green-400 bg-green-50 font-bold text-green-700 ' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-300'} outline-none focus:ring-2 focus:ring-indigo-500`}
                            />
                          </div>
                        ))}
                      </div>

                      <div className='mt-4 pt-3 border-t border-gray-100'>
                        <input
                          type='text'
                          placeholder='在此粘贴 1. 2. 3. 4. 选项文本，系统将自动拆分并匹配正确答案。'
                          onChange={e => {
                            handleParseCardOptions(qIndex, e.target.value)
                            e.target.value = ''
                          }}
                          className='w-full px-4 py-2 text-xs bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white text-indigo-700 placeholder-indigo-300 transition-all'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className='border border-indigo-100 bg-white p-4'>
                <label className='text-sm font-black text-indigo-900 mb-2 block'>
                  快速添加阅读题
                </label>
                <textarea
                  value={articleQuickInput}
                  onChange={e => setArticleQuickInput(e.target.value)}
                  rows={3}
                  placeholder='粘贴含 1. 2. 3. 4. 选项的题目文本'
                  className='w-full px-4 py-3 border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white mb-3'
                />
                <button
                  type='button'
                  onClick={handleArticleAddQuestion}
                  className='bg-white text-indigo-600 border border-indigo-200 font-bold px-4 py-2 hover:bg-indigo-100 transition-colors text-sm '>
                  识别预览
                </button>
                {articleParsedDrafts.length > 0 && (
                  <button
                    type='button'
                    onClick={handleConfirmArticlePreviewImport}
                    className='ml-2 bg-indigo-600 text-white border border-indigo-600 font-bold px-4 py-2 hover:bg-indigo-700 transition-colors text-sm'>
                    确认导入（{articleParsedDrafts.length}）
                  </button>
                )}

                {articleParsedPreviewRows.length > 0 && (
                  <div className='mt-4 overflow-x-auto border border-indigo-100'>
                    {articleParsedPreviewRows.some(row => row.isDuplicateToken) && (
                      <div className='border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700'>
                        检测到重号：同一占位符在正文中出现多次，已标红。请先修正编号再导入。
                      </div>
                    )}
                    <table className='min-w-full text-left text-xs'>
                      <thead className='bg-indigo-50 text-indigo-900'>
                        <tr>
                          <th className='px-3 py-2 font-bold'>Q序号</th>
                          <th className='px-3 py-2 font-bold'>命中文章占位符</th>
                          <th className='px-3 py-2 font-bold'>生成题干</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articleParsedPreviewRows.map((row, index) => (
                          <tr
                            key={`article-preview-${index}`}
                            className={`border-t ${
                              row.isDuplicateToken
                                ? 'border-rose-100 bg-rose-50/70'
                                : 'border-indigo-100'
                            }`}>
                            <td className='px-3 py-2 font-semibold text-gray-700'>
                              {row.serial}
                            </td>
                            <td
                              className={`px-3 py-2 font-semibold ${
                                row.isDuplicateToken || row.placeholderToken === '未命中'
                                  ? 'text-rose-600'
                                  : 'text-emerald-700'
                              }`}>
                              {row.isDuplicateToken
                                ? `${row.placeholderToken}（重号）`
                                : row.placeholderToken}
                            </td>
                            <td className='px-3 py-2 text-gray-700'>
                              {row.generatedPrompt}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <button
              disabled={isSubmitting}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 transition-all disabled:opacity-50 shadow-indigo-200 text-lg'>
              {isSubmitting ? '保存中...' : '保存文章与题目'}
            </button>
          </form>
        )}

        {/* ================= 3. 题目上传视图 (代码未改动) ================= */}
        {activeTab === 'quiz' && (
          <form
            onSubmit={handleQuizSubmit}
            className='animate-in space-y-8 border border-gray-100 bg-white p-5 fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
            <div className='space-y-1'>
              <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
                题库题目录入
              </h2>
              <p className='text-sm text-gray-500'>
                可先粘贴整题自动解析，再做少量校对后保存。
              </p>
            </div>

            <CategorySelector
              value={quizForm.categoryId}
              onChange={val => setQuizForm({ ...quizForm, categoryId: val })}
            />

            <section className='border border-emerald-100 bg-emerald-50/40 p-4 md:p-5'>
              <label className='mb-2 block text-sm font-black text-emerald-900'>
                批量粘贴多题（智能识别）
              </label>
              <p className='mb-3 text-xs leading-relaxed text-emerald-700'>
                一次粘贴多题文本，系统会按“题干 + 4 个选项”自动拆分。
                支持 `1.2.3.4`、`①②③④`、`A.B.C.D` 选项标记。
              </p>
              <textarea
                value={bulkQuickInput}
                onChange={e => setBulkQuickInput(e.target.value)}
                rows={7}
                placeholder='在此粘贴多道题目（题与题之间建议空一行）'
                className='w-full resize-y border border-emerald-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500'
              />
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={handleBulkQuickParse}
                  className='bg-white border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100'>
                  识别多题
                </button>
                <button
                  type='button'
                  disabled={isSubmitting || bulkParsedQuestions.length === 0}
                  onClick={() => void handleBulkQuizSave()}
                  className='bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50'>
                  {isSubmitting ? '批量保存中...' : `批量保存（${bulkParsedQuestions.length}）`}
                </button>
                {bulkParsedQuestions.length > 0 && (
                  <span className='text-xs font-semibold text-emerald-700'>
                    已识别 {bulkParsedQuestions.length} 题（可在下方逐题校对后再保存）
                  </span>
                )}
              </div>

              {bulkParsedQuestions.length > 0 && (
                <div className='mt-4 border-t border-emerald-200 pt-4'>
                  <div className='mb-3 flex gap-2 overflow-x-auto pb-1'>
                    {bulkParsedQuestions.map((_, qIndex) => (
                      <button
                        key={`bulk-tab-${qIndex}`}
                        type='button'
                        onClick={() => setBulkEditingIndex(qIndex)}
                        className={`h-8 shrink-0 border px-3 text-xs font-bold transition-colors ${
                          bulkEditingIndex === qIndex
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                        }`}>
                        第 {qIndex + 1} 题
                      </button>
                    ))}
                  </div>

                  {bulkParsedQuestions[bulkEditingIndex] && (
                    <div className='border border-emerald-200 bg-white p-3'>
                      <div className='mb-2 flex items-center justify-between gap-2'>
                        <span className='text-sm font-bold text-emerald-800'>
                          当前编辑：第 {bulkEditingIndex + 1} 题
                        </span>
                        <button
                          type='button'
                          onClick={() => handleBulkRemoveQuestion(bulkEditingIndex)}
                          className='border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50'>
                          删除
                        </button>
                      </div>

                      <div className='grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr]'>
                        <select
                          value={bulkParsedQuestions[bulkEditingIndex].questionType}
                          onChange={e =>
                            handleBulkQuestionTypeChange(
                              bulkEditingIndex,
                              e.target.value as ParsedQuizDraft['questionType'],
                            )
                          }
                          className='h-10 border border-emerald-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-400'>
                          <option value='PRONUNCIATION'>读音题</option>
                          <option value='WORD_DISTINCTION'>单词辨析题</option>
                          <option value='GRAMMAR'>语法题</option>
                          <option value='FILL_BLANK'>填空题</option>
                          <option value='SORTING'>排序题</option>
                        </select>
                        <input
                          value={bulkParsedQuestions[bulkEditingIndex].prompt}
                          onChange={e =>
                            handleBulkPromptChange(
                              bulkEditingIndex,
                              e.target.value,
                            )
                          }
                          placeholder='题干'
                          className='h-10 border border-emerald-200 bg-white px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-400'
                        />
                      </div>

                      <div className='mt-2'>
                        <textarea
                          ref={bulkContextTextareaRef}
                          value={bulkParsedQuestions[bulkEditingIndex].contextSentence}
                          onChange={e =>
                            handleBulkContextSentenceChange(
                              bulkEditingIndex,
                              e.target.value,
                            )
                          }
                          rows={2}
                          className='w-full border border-emerald-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400'
                          placeholder='语境句（建议完整句子）'
                        />
                      </div>

                      {(bulkParsedQuestions[bulkEditingIndex].questionType ===
                        'PRONUNCIATION' ||
                        bulkParsedQuestions[bulkEditingIndex].questionType ===
                          'WORD_DISTINCTION') && (
                        <div className='mt-2 flex flex-wrap items-center gap-2'>
                          <button
                            type='button'
                            onClick={handleBulkPickTargetWordFromSelection}
                            className='h-9 border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100'>
                            划词设目标词
                          </button>
                          <input
                            value={
                              bulkParsedQuestions[bulkEditingIndex].targetWord ||
                              ''
                            }
                            onChange={e =>
                              handleBulkTargetWordChange(
                                bulkEditingIndex,
                                e.target.value,
                              )
                            }
                            placeholder='目标词（前台下划线显示）'
                            className='h-9 min-w-0 flex-1 border border-emerald-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400'
                          />
                        </div>
                      )}

                      <div className='mt-2 grid grid-cols-1 gap-2 md:grid-cols-2'>
                        {bulkParsedQuestions[bulkEditingIndex].options.map(
                          (opt, optIndex) => (
                            <label
                              key={`bulk-q-${bulkEditingIndex}-opt-${optIndex}`}
                              className='flex items-center gap-2 border border-gray-200 px-2.5 py-2'>
                              <input
                                type='radio'
                                checked={opt.isCorrect}
                                onChange={() =>
                                  setBulkCorrectOption(
                                    bulkEditingIndex,
                                    optIndex,
                                  )
                                }
                                className='shrink-0'
                              />
                              <input
                                value={opt.text}
                                onChange={e =>
                                  handleBulkOptionTextChange(
                                    bulkEditingIndex,
                                    optIndex,
                                    e.target.value,
                                  )
                                }
                                placeholder={`选项 ${optIndex + 1}`}
                                className='min-w-0 flex-1 border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400'
                              />
                            </label>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className='border border-indigo-100 bg-indigo-50/50 p-4 shadow-inner md:p-5'>
              <label className='mb-2 block text-sm font-black text-indigo-900'>
                快速粘贴（推荐）
              </label>
              <p className='mb-3 text-xs leading-relaxed text-indigo-700'>
                粘贴包含题干和 4 个选项的文本，系统会自动拆分并填充表单。
                <br />
                <span className='font-mono bg-white/50 px-1 rounded'>
                  友人にピアノの伴奏を頼まれた。 1．はんそう 2．ばんそう
                  3．はんそ 4．ばんそ
                </span>
              </p>
              <textarea
                value={quickInput}
                onChange={e => handleQuickParse(e.target.value)}
                rows={3}
                placeholder='在此粘贴整题文本'
                className='w-full px-4 py-3 border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white'
              />

              {quizForm.questionType !== 'SORTING' && (
                <div className='mt-4 border border-indigo-100 bg-white/75 p-3'>
                  <span className='mb-2 block text-xs font-bold tracking-wide text-indigo-800'>
                    正确答案
                  </span>
                  <div className='flex flex-wrap gap-2'>
                    {[1, 2, 3, 4].map((num, idx) => (
                      <button
                        key={num}
                        type='button'
                        onClick={() => setCorrectOption(idx)}
                        className={`h-9 min-w-9 px-3 text-sm font-black transition-all ${quizForm.options[idx].isCorrect ? 'bg-emerald-500 text-white shadow-emerald-200' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                        选项 {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <div className='flex items-center gap-4'>
              <div className='flex-1 h-px bg-gray-100'></div>
              <span className='text-xs font-bold text-gray-300'>
                解析结果可继续编辑
              </span>
              <div className='flex-1 h-px bg-gray-100'></div>
            </div>

            <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              <div className='border border-gray-200 bg-gray-50/40 p-4'>
                <label className='mb-2 block text-sm font-bold text-gray-700'>
                  题型选择
                </label>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                  {[
                    { value: 'PRONUNCIATION', label: '读音题' },
                    { value: 'WORD_DISTINCTION', label: '单词辨析题' },
                    { value: 'GRAMMAR', label: '语法题' },
                    { value: 'FILL_BLANK', label: '填空题' },
                    { value: 'SORTING', label: '排序题' },
                  ].map(type => (
                    <button
                      key={type.value}
                      type='button'
                      onClick={() => {
                        setSortSequence([])
                        setQuizForm({ ...quizForm, questionType: type.value })
                      }}
                      className={`border px-3 py-2 text-sm font-bold transition-colors ${
                        quizForm.questionType === type.value
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className='border border-gray-200 bg-gray-50/40 p-4'>
                <label className='mb-2 block text-sm font-bold text-gray-700'>
                  题目呈现
                </label>
                <p className='mb-2 text-xs text-gray-500'>
                  前台做题时显示这段文字。
                </p>
                <input
                  type='text'
                  value={quizForm.prompt}
                  onChange={e =>
                    setQuizForm({ ...quizForm, prompt: e.target.value })
                  }
                  className='w-full border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500'
                  placeholder='例如：チームの(　　　)を強めよう。（可留空）'
                />
              </div>
            </section>

            <section className='border border-indigo-100 bg-indigo-50/40 p-4'>
              {quizForm.questionType === 'SORTING' && (
                <div className='mb-4 border border-orange-200 bg-orange-50 p-4'>
                  <label className='mb-2 block text-sm font-bold text-orange-800'>
                    排序设置：按正确语序依次点击 4 个选项
                  </label>
                  <div className='flex flex-wrap gap-2 mb-4'>
                    {quizForm.options.map((opt, i) => {
                      const isClicked = sortSequence.includes(i)
                      const orderNum = sortSequence.indexOf(i) + 1
                      return (
                        <button
                          key={i}
                          type='button'
                          disabled={isClicked || !opt.text}
                          onClick={() => handleSortClick(i)}
                          className={`relative px-4 py-2 font-bold transition-all ${isClicked ? 'bg-orange-200 text-orange-500 opacity-50' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-100'}`}>
                          {opt.text || `选项 ${i + 1}`}
                          {isClicked && (
                            <span className='absolute -top-2 -right-2 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center'>
                              {orderNum}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {sortSequence.length === 4 ? (
                    <div className='text-sm text-green-600 font-bold flex justify-between items-center'>
                      <span>
                        语序组装完成，系统已自动提取星号答案与完整句子。
                      </span>
                      <button
                        type='button'
                        onClick={() => setSortSequence([])}
                        className='text-orange-500 underline'>
                        重置顺序
                      </button>
                    </div>
                  ) : (
                    <div className='text-xs text-orange-500'>
                        还需点击 {4 - sortSequence.length} 个选项
                      </div>
                  )}
                </div>
              )}
              <label className='mb-2 block text-sm font-bold text-indigo-900'>
                语境句
              </label>
              <p className='mb-2 text-xs text-indigo-700'>
                用于生词与复习展示，建议填写完整句子。
              </p>
              <textarea
                ref={quizContextTextareaRef}
                value={quizForm.contextSentence}
                onChange={e =>
                  setQuizForm({ ...quizForm, contextSentence: e.target.value })
                }
                rows={2}
                className='w-full border border-indigo-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500'
                placeholder='例如：チームの結束を強めよう。（可留空）'
              />
              {(quizForm.questionType === 'PRONUNCIATION' ||
                quizForm.questionType === 'WORD_DISTINCTION') && (
                <div className='mt-3 border border-indigo-200 bg-white p-3'>
                  <div className='mb-2 flex flex-wrap items-center gap-2'>
                    <button
                      type='button'
                      onClick={handlePickTargetWordFromSelection}
                      className='h-9 border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100'>
                      从语境句划词设为读音目标
                    </button>
                    <input
                      type='text'
                      value={quizForm.targetWord}
                      onChange={e =>
                        setQuizForm({ ...quizForm, targetWord: e.target.value.trim() })
                      }
                      placeholder='或手动输入目标词'
                      className='h-9 min-w-0 flex-1 border border-indigo-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500'
                    />
                  </div>
                  <div className='text-sm leading-relaxed text-gray-700'>
                    {renderTargetWordPreview(quizForm.contextSentence, quizForm.targetWord)}
                  </div>
                </div>
              )}
              {!quizHasQuestionContent && (
                <div className='mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800'>
                  请先补充题目内容，再保存题目。可在“快速粘贴”“题目呈现”或“语境句”任一处输入。
                </div>
              )}
            </section>

            <section className='border border-gray-200 bg-gray-50/40 p-4 md:p-5'>
              <label className='mb-3 block text-sm font-bold text-gray-700'>
                选项设置
              </label>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {quizForm.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className='flex min-w-0 items-center gap-3 border border-gray-200 bg-white px-3 py-2.5'>
                    <input
                      type='radio'
                      name='correctOption'
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(idx)}
                      className='w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-gray-300'
                    />
                    <input
                      type='text'
                      value={opt.text}
                      onChange={e => {
                        const newOptions = [...quizForm.options]
                        newOptions[idx].text = e.target.value
                        setQuizForm({ ...quizForm, options: newOptions })
                      }}
                      className='min-w-0 flex-1 border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500'
                      placeholder={`选项 ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <label className='block text-sm font-bold text-gray-700 mb-2'>
                解析（可选）
              </label>
              <textarea
                value={quizForm.explanation}
                onChange={e =>
                  setQuizForm({ ...quizForm, explanation: e.target.value })
                }
                rows={2}
                className='w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50'
                placeholder='可补充解题思路或易错点。'
              />
            </section>

            <button
              disabled={isSubmitting || !quizHasQuestionContent}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 transition-all disabled:opacity-50 shadow-indigo-200'>
              {isSubmitting
                ? '保存中...'
                : quizHasQuestionContent
                  ? '保存题目'
                  : '请先填写题目内容'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
