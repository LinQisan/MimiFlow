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
    sectionNumber: z.number().int().positive().nullable().optional(),
    listeningSectionTitle: z.string().optional(),
    sectionTitle: z.string().optional(),
    imageUrl: z.string().optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export type QuestionContent = z.output<typeof questionContentSchema>

export function decodeQuestionContent(value: unknown): QuestionContent {
  return questionContentSchema.parse(value)
}

export function encodeQuestionContent(value: unknown): Prisma.InputJsonValue {
  const content = { ...decodeQuestionContent(value) }
  for (const key of canonicalQuestionKeys) delete content[key]
  return content as Prisma.InputJsonValue
}
