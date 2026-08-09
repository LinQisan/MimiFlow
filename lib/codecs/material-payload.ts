import { MaterialType, Prisma } from '@prisma/client'
import { z } from 'zod'

export const materialDialogueSchema = z
  .object({
    id: z.coerce.number().finite().optional(),
    sequenceId: z.coerce.number().finite().optional(),
    stableId: z.string().trim().optional(),
    text: z.string().catch(''),
    start: z.coerce.number().finite().catch(0),
    end: z.coerce.number().finite().catch(0),
    note: z.string().catch(''),
    favorite: z.boolean().catch(false),
  })
  .passthrough()

const audioPayloadFields = {
  audioFile: z.string().catch(''),
  audioUrl: z.string().catch(''),
  dialogues: z.array(materialDialogueSchema).catch([]),
  description: z.string().catch(''),
  transcript: z.string().catch(''),
  source: z.string().catch(''),
  language: z.string().catch(''),
  difficulty: z.string().catch(''),
  tags: z.array(z.string()).catch([]),
}

export const listeningPayloadSchema = z
  .object({
    ...audioPayloadFields,
    jlptLevel: z.string().catch(''),
    jlptSession: z.string().catch(''),
    listeningSectionNumber: z.coerce.number().int().positive().nullable().catch(null),
    listeningSectionTitle: z.string().catch(''),
    questionNumber: z.coerce.number().int().positive().nullable().catch(null),
    sectionNumber: z.coerce.number().int().positive().nullable().catch(null),
    sectionTitle: z.string().catch(''),
    questionEntryRequired: z.boolean().catch(false),
  })
  .passthrough()

export const speakingPayloadSchema = z
  .object(audioPayloadFields)
  .passthrough()

export const readingPayloadSchema = z
  .object({
    text: z.string().catch(''),
    description: z.string().catch(''),
    title: z.string().catch(''),
    author: z.string().catch(''),
    language: z.string().catch(''),
    sourceKind: z.string().catch(''),
    fileName: z.string().catch(''),
    chapters: z
      .array(
        z.object({
          id: z.string().catch(''),
          title: z.string().catch(''),
          text: z.string().catch(''),
          href: z.string().catch(''),
        }),
      )
      .catch([]),
  })
  .passthrough()

export const vocabularyGrammarPayloadSchema = z
  .object({
    title: z.string().catch(''),
    description: z.string().catch(''),
  })
  .passthrough()

export const mediaSubtitlePayloadSchema = z
  .object({
    ...audioPayloadFields,
    subtitleSourceType: z.enum(['MOVIE', 'TV']).catch('MOVIE'),
    subtitleWorkTitle: z.string().catch(''),
    subtitleSeason: z.string().catch(''),
    subtitleEpisode: z.string().catch(''),
    subtitleNoAudio: z.boolean().catch(false),
  })
  .passthrough()

export const materialPayloadEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(MaterialType.LISTENING), payload: listeningPayloadSchema }),
  z.object({ type: z.literal(MaterialType.SPEAKING), payload: speakingPayloadSchema }),
  z.object({ type: z.literal(MaterialType.READING), payload: readingPayloadSchema }),
  z.object({
    type: z.literal(MaterialType.VOCAB_GRAMMAR),
    payload: vocabularyGrammarPayloadSchema,
  }),
  z.object({
    type: z.literal(MaterialType.MEDIA_SUBTITLE),
    payload: mediaSubtitlePayloadSchema,
  }),
])

export type MaterialPayloadEnvelope = z.output<
  typeof materialPayloadEnvelopeSchema
>
export type MaterialPayload<T extends MaterialType> = Extract<
  MaterialPayloadEnvelope,
  { type: T }
>['payload']

export function decodeMaterialPayload<T extends MaterialType>(
  type: T,
  value: unknown,
): MaterialPayload<T> {
  return materialPayloadEnvelopeSchema.parse({ type, payload: value }).payload as MaterialPayload<T>
}

export function encodeMaterialPayload<T extends MaterialType>(
  type: T,
  value: unknown,
): Prisma.InputJsonValue {
  return decodeMaterialPayload(type, value) as Prisma.InputJsonValue
}

export function decodeMaterialPayloadRecord(
  type: MaterialType,
  value: unknown,
): Record<string, unknown> {
  return decodeMaterialPayload(type, value) as Record<string, unknown>
}

export function patchMaterialPayload<T extends MaterialType>(
  type: T,
  current: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  return encodeMaterialPayload(type, {
    ...decodeMaterialPayload(type, current),
    ...patch,
  })
}
