import { z } from 'zod'

const text = z.string().max(20_000)
const shortText = z.string().max(4_000)
const optionalText = text.optional().nullable()

const identified = z.object({ id: z.string().min(1).optional() }).passthrough()

const definition = identified.extend({
  language: z.string().min(1).max(32),
  dictionaryName: shortText,
  definition: text,
  senseId: z.string().min(1).nullable(),
})

const sentence = identified.extend({
  senseId: z.string().min(1).nullable(),
  text: text.min(1),
  translation: optionalText,
  source: shortText,
  sourceUrl: shortText,
  audioFile: optionalText,
  meaningIndex: z.number().int().nullable(),
  posTags: z.array(z.string().min(1).max(200)).max(100),
})

const pattern = identified.extend({
  senseId: z.string().min(1).nullable(),
  text: text.min(1),
  meaning: optionalText,
})

const expression = identified.extend({
  senseId: z.string().min(1).nullable(),
  type: z.enum(['collocation', 'compound', 'idiom']),
  text: text.min(1),
  reading: optionalText,
  meaning: optionalText,
})

const relation = identified.extend({
  senseId: z.string().min(1).nullable(),
  type: z.enum([
    'compound',
    'synonym',
    'antonym',
    'related',
    'collocation',
    'transitivity_pair',
    'derived',
  ]),
  targetVocabularyId: z.string().min(1).optional().nullable(),
  targetText: text,
  targetReading: optionalText,
  marker: shortText.optional().nullable(),
  pattern: shortText.optional().nullable(),
})

const note = identified.extend({
  senseId: z.string().min(1).nullable(),
  type: z.enum(['usage', 'register', 'restriction', 'grammar', 'nuance', 'warning']),
  text: text.min(1),
})

export const vocabularyInspectorEntryDraftSchema = z.object({
  id: z.string().min(1),
  word: text.min(1),
  pronunciations: z.array(text).max(100),
  etymologies: z.array(text).max(100).optional(),
  partsOfSpeech: z.array(text).max(100),
  meanings: z.array(text).max(100),
  grammarPartOfSpeech: z
    .enum(['noun', 'verb', 'i_adjective', 'na_adjective', 'adverb', 'adnominal', 'other'])
    .nullable(),
  transitivity: z.enum(['intransitive', 'transitive', 'both']).nullable(),
  conjugationType: optionalText,
  wordAudio: optionalText,
  tags: z.array(shortText).max(200),
  wordbookIds: z.array(z.string().min(1)).max(200),
  senses: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  definitions: z.array(definition).max(2_000),
  sentences: z.array(sentence).max(2_000),
  patterns: z.array(pattern).max(2_000),
  expressions: z.array(expression).max(2_000),
  relations: z.array(relation).max(2_000),
  notes: z.array(note).max(2_000),
}).passthrough()

export type VocabularyInspectorEntryInput = z.infer<typeof vocabularyInspectorEntryDraftSchema>

export function parseVocabularyInspectorEntry(
  input: unknown,
):
  | { success: true; data: VocabularyInspectorEntryInput }
  | { success: false; error: z.ZodError } {
  const candidate = typeof input === 'object' && input !== null && 'entry' in input
    ? input.entry
    : input
  const parsed = vocabularyInspectorEntryDraftSchema.safeParse(candidate)
  if (!parsed.success) return parsed
  return {
    success: true as const,
    data: parsed.data,
  }
}

export function hasClientSenseId(id: string) {
  return id.startsWith('client-')
}
