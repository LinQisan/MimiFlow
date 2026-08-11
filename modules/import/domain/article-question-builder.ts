import { parseMultiQuizText } from './quiz-text-parser'
import type {
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
} from '../types'

const isSentenceBoundaryAt = (text: string, index: number) => {
  const ch = text[index]
  if (!ch) return false
  if (
    ch === '\n' ||
    ch === '。' ||
    ch === '！' ||
    ch === '？' ||
    ch === '!' ||
    ch === '?'
  )
    return true
  if (ch === '.') {
    const prev = text[index - 1] || ''
    const next = text[index + 1] || ''
    if (/\d/.test(prev) && /\d/.test(next)) return false
    return true
  }
  return false
}

export const extractSentenceAroundIndex = (
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
  for (
    let i = safeIndex + Math.max(1, anchorLength);
    i < text.length;
    i += 1
  ) {
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

export const rebuildFillBlankPromptFromQuestion = (
  question: ArticleImportedQuestionDraft,
) => {
  if (!question || question.questionType !== 'FILL_BLANK') return question
  const correctText =
    question.options?.find(opt => opt?.isCorrect)?.text?.trim() || ''
  const context = (question.contextSentence || '').trim()
  if (!context) return question
  if (!fillBlankTokenRegex.test(context) || !correctText) return question
  return {
    ...question,
    prompt: context.replace(fillBlankTokenRegex, correctText),
  }
}

export const buildArticleQuestionsFromQuickInput = (
  input: string,
  articleContent: string,
) => {
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
    if (!content || !serialNumber)
      return { token: '', index: -1, matchCount: 0 }
    const normalizedContent = normalizeAsciiDigit(content)
    const escaped = serialNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const tokenCountPattern = new RegExp(
      `[\\[［(（【「『]\\s*${escaped}\\s*[\\]］)）】」』]`,
      'g',
    )
    const matchCount = [...normalizedContent.matchAll(tokenCountPattern)]
      .length
    const patterns = [
      new RegExp(`[\\[［(（【「『]\\s*${escaped}\\s*[\\]］)）】」』]`),
      new RegExp(`第\\s*${escaped}\\s*[题題問]`),
      new RegExp(`(^|\\D)${escaped}(\\D|$)`),
    ]
    for (
      let patternIndex = 0;
      patternIndex < patterns.length;
      patternIndex += 1
    ) {
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
    const correctOption =
      item.options.find(opt => opt.isCorrect)?.text?.trim() || ''
    const promptPlaceholder =
      normalizeAsciiDigit(normalizedPrompt).match(
        /[\[［(（【「『]\s*(\d+)\s*[\]］)）】」』]/,
      )?.[1] || ''
    const serialNumber = promptPlaceholder || extractSerialNumber(promptText)
    const placeholderHit = findPlaceholderTokenBySerial(
      articleContent || '',
      serialNumber,
    )
    const matchedToken = placeholderHit.token
    const matchedSentence =
      matchedToken && articleContent && placeholderHit.index >= 0
        ? extractSentenceAroundIndex(
            articleContent,
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
            return replaceBlankWithAnswer(
              resolvedContextSentence,
              correctOption,
            )
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

  const previewRows: ArticlePreviewRow[] = newQuestions.map(
    (question, idx) => ({
      serial: question.__previewSerial || `${idx + 1}`,
      placeholderToken: question.__previewToken || '未命中',
      generatedPrompt: question.prompt || '（空题干）',
      isDuplicateToken: Boolean(question.__previewDuplicateToken),
    }),
  )

  const drafts = newQuestions.map(question => {
    const { __previewSerial: _previewSerial, ...rest } = question
    void _previewSerial
    return rest
  })

  return { drafts, previewRows }
}
