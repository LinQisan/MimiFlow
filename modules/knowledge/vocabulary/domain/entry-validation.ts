import { z } from 'zod'
import { parseJsonStringList, toJsonStringList } from '../../../../utils/text/jsonList.ts'
import { normalizeRelationMetadata } from './relations.ts'

const text = z.string().trim().max(4000)
const optionalText = z.string().trim().max(4000).optional().nullable()

const definitionSchema = z.object({
  id: z.string(),
  language: z.string().trim().min(1).max(16),
  text: text.min(1),
})

const exampleSchema = z.object({
  id: z.string(),
  text: text.min(1),
  translation: optionalText,
  source: z.string().trim().max(500).default('手动录入'),
  sourceUrl: z.string().trim().max(2000).default('#'),
  posTags: z.array(z.string().trim().min(1)).max(20).optional(),
})

export const normalizeVocabularyEntryPosTags = (values: string[]) =>
  Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, 20)

export const serializeVocabularyEntryPosTags = (
  values: string[] | undefined,
  existingSerialized?: string | null,
) =>
  toJsonStringList(
    normalizeVocabularyEntryPosTags(
      values === undefined ? parseJsonStringList(existingSerialized) : values,
    ),
  )

const patternSchema = z.object({
  id: z.string(),
  text: text.min(1),
  meaning: optionalText,
})

const expressionSchema = z.object({
  id: z.string(),
  type: z.enum(['collocation', 'compound', 'idiom']),
  text: text.min(1),
  reading: optionalText,
  meaning: optionalText,
})

const relationSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      'compound',
      'synonym',
      'antonym',
      'related',
      'collocation',
      'transitivity_pair',
      'derived',
    ]),
    targetVocabularyId: z.string().trim().optional().nullable(),
    targetText: text,
    targetReading: optionalText,
    marker: z.string().trim().max(40).optional().nullable(),
    pattern: z.string().trim().max(300).optional().nullable(),
  })
  .refine(value => Boolean(value.targetVocabularyId || value.targetText), {
    message: '关联词不能为空',
  })
  .transform(value => normalizeRelationMetadata(value))

const noteSchema = z.object({
  id: z.string(),
  type: z.enum([
    'usage',
    'register',
    'restriction',
    'grammar',
    'nuance',
    'warning',
  ]),
  text: text.min(1),
})

const senseSchema = z.object({
  id: z.string(),
  definitions: z.array(definitionSchema).min(1, '每个义项至少需要一个释义'),
  examples: z.array(exampleSchema),
  patterns: z.array(patternSchema),
  expressions: z.array(expressionSchema),
  relations: z.array(relationSchema),
  notes: z.array(noteSchema),
})

export const vocabularyEntryDraftSchema = z.object({
  vocabularyId: z.string().min(1),
  word: z.string().trim().min(1, '单词不能为空').max(300),
  reading: z.string().trim().max(500),
  etymologies: z.array(z.string().trim().max(4000)).max(100).optional(),
  grammarPartOfSpeech: z.enum([
    'noun',
    'verb',
    'i_adjective',
    'na_adjective',
    'adverb',
    'adnominal',
    'other',
  ]),
  transitivity: z
    .enum(['intransitive', 'transitive', 'both'])
    .optional()
    .nullable(),
  conjugationType: z.string().trim().max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100),
  senses: z.array(senseSchema).min(1, '词条至少需要一个义项'),
  relations: z.array(relationSchema),
})
