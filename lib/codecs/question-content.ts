import { Prisma } from '@prisma/client'
import { z } from 'zod'

const canonicalQuestionKeys = [
  'prompt',
  'context',
  'contextSentence',
  'options',
  'answer',
  'analysis',
  'explanation',
  'note',
  'questionType',
] as const

const questionContentSchema = z
  .object({
    targetWord: z.string().nullable().optional(),
    optionLabelFormat: z.string().optional(),
    customOptionLabels: z.array(z.string()).catch([]),
    shuffleOptions: z.boolean().optional(),
    sortingOrder: z.array(z.number().int().nonnegative()).optional(),
    listeningSectionNumber: z.number().int().positive().nullable().optional(),
    listeningSectionTitle: z.string().optional(),
    imageUrl: z.string().optional(),
  })
  .passthrough()

export type QuestionContent = z.output<typeof questionContentSchema>

const retiredQuestionContentKeys = [
  'order',
  'legacy',
  'sectionNumber',
  'sectionTitle',
] as const

export function decodeQuestionContent(value: unknown): QuestionContent {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const retiredKey = retiredQuestionContentKeys.find(key => key in value)
    if (retiredKey) {
      throw new Error(`Question content contains retired key: ${retiredKey}`)
    }
  }
  return questionContentSchema.parse(value)
}

export function encodeQuestionContent(value: unknown): Prisma.InputJsonValue {
  const content = { ...decodeQuestionContent(value) }
  for (const key of canonicalQuestionKeys) delete content[key]
  return content as Prisma.InputJsonValue
}
