import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { MIN_QUESTION_OPTION_COUNT } from '@/utils/questions/editorOptions'
import { normalizeQuestionTextFields } from '@/modules/practice/domain/question-text'

type ListeningQuestionDraft = {
  questionType:
    | 'LISTENING'
    | 'TOEIC_PHOTOGRAPH'
    | 'TOEIC_QUESTION_RESPONSE'
    | 'TOEIC_CONVERSATIONS'
    | 'TOEIC_TALKS'
  optionKind: 'text' | 'image'
  prompt: string | null
  context: string | null
  explanation: string | null
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string[]
  shuffleOptions: boolean
  sourceFileName: string | null
  options: Array<{
    text: string
    imageUrl: string | null
    isCorrect: boolean
  }>
}

export type ListeningQuestionDraftPayload = {
  listeningSectionNumber: number | null
  listeningSectionTitle: string | null
  questions: ListeningQuestionDraft[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

export function parseListeningQuestionDraftPayload(
  raw: FormDataEntryValue | null,
): ListeningQuestionDraftPayload {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      listeningSectionNumber: null,
      listeningSectionTitle: null,
      questions: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('题目数据无法解析，请重新填写。')
  }
  if (!isRecord(parsed)) throw new Error('题目数据格式不正确。')

  const rawSectionNumber = toTrimmedString(parsed.listeningSectionNumber)
  const parsedSectionNumber = rawSectionNumber ? Number(rawSectionNumber) : null
  if (
    parsedSectionNumber !== null &&
    (!Number.isInteger(parsedSectionNumber) || parsedSectionNumber < 1)
  ) {
    throw new Error('問題编号必须是正整数。')
  }

  const rawQuestions = parsed.questions
  if (!Array.isArray(rawQuestions)) throw new Error('题目数据格式不正确。')
  if (rawQuestions.length > 100) throw new Error('一次最多填写 100 道题。')

  const questions = rawQuestions.map((rawQuestion, questionIndex) => {
    if (!isRecord(rawQuestion)) {
      throw new Error(`第 ${questionIndex + 1} 题的数据格式不正确。`)
    }
    if (!Array.isArray(rawQuestion.options)) {
      throw new Error(`第 ${questionIndex + 1} 题缺少选项。`)
    }
    if (rawQuestion.options.length < MIN_QUESTION_OPTION_COUNT) {
      throw new Error(
        `第 ${questionIndex + 1} 题至少需要 ${MIN_QUESTION_OPTION_COUNT} 个选项。`,
      )
    }
    if (rawQuestion.options.length > 20) {
      throw new Error(`第 ${questionIndex + 1} 题的选项过多。`)
    }

    const options = rawQuestion.options.map((rawOption, optionIndex) => {
      if (!isRecord(rawOption)) {
        throw new Error(
          `第 ${questionIndex + 1} 题的第 ${optionIndex + 1} 个选项格式不正确。`,
        )
      }
      return {
        text: toTrimmedString(rawOption.text),
        imageUrl: toTrimmedString(rawOption.imageUrl) || null,
        isCorrect: rawOption.isCorrect === true,
      }
    })
    if (!options.some(option => option.isCorrect)) {
      throw new Error(`请为第 ${questionIndex + 1} 题选择正确答案。`)
    }

    const optionLabelFormat = normalizeOptionLabelFormat(
      rawQuestion.optionLabelFormat,
      'numeric',
    )
    const customOptionLabels = parseCustomOptionLabels(
      rawQuestion.customOptionLabels,
    )
    if (
      optionLabelFormat === 'custom' &&
      customOptionLabels.length < options.length
    ) {
      throw new Error(
        `第 ${questionIndex + 1} 题需要为每个选项填写自定义序号。`,
      )
    }

    const text = normalizeQuestionTextFields(
      toTrimmedString(rawQuestion.prompt),
      toTrimmedString(rawQuestion.contextSentence),
    )
    const listeningQuestionTypes = new Set<ListeningQuestionDraft['questionType']>([
      'LISTENING',
      'TOEIC_PHOTOGRAPH',
      'TOEIC_QUESTION_RESPONSE',
      'TOEIC_CONVERSATIONS',
      'TOEIC_TALKS',
    ])
    const rawQuestionType = toTrimmedString(rawQuestion.questionType)
    const questionType: ListeningQuestionDraft['questionType'] =
      listeningQuestionTypes.has(
        rawQuestionType as ListeningQuestionDraft['questionType'],
      )
        ? (rawQuestionType as ListeningQuestionDraft['questionType'])
        : 'LISTENING'
    const optionKind: ListeningQuestionDraft['optionKind'] =
      rawQuestion.optionKind === 'image' ||
      options.some(option => Boolean(option.imageUrl))
        ? 'image'
        : 'text'
    return {
      questionType,
      optionKind,
      prompt: text.prompt,
      context: text.context,
      explanation: toTrimmedString(rawQuestion.explanation) || null,
      optionLabelFormat,
      customOptionLabels,
      shuffleOptions: rawQuestion.shuffleOptions !== false,
      sourceFileName: toTrimmedString(rawQuestion.sourceFileName) || null,
      options,
    }
  })

  return {
    listeningSectionNumber: parsedSectionNumber,
    listeningSectionTitle:
      toTrimmedString(parsed.listeningSectionTitle) || null,
    questions,
  }
}
