import { z } from 'zod'
import type { SudachiLexeme } from '../../../language/domain/sudachi'

export const SELECTION_ATTRIBUTE_OPTIONS = [
  ['collocation', '搭配'],
  ['idiom', '惯用表达'],
  ['related', '相关表达'],
  ['synonym', '近义词（類義）'],
] as const

export const selectionAttributeSchema = z.object({
  text: z.string().trim().min(1, '请填写表达').max(300),
  reading: z.string().trim().max(500).default(''),
  meaning: z.string().trim().max(2000).default(''),
  type: z.enum(['collocation', 'idiom', 'related', 'synonym']),
  targets: z.array(z.object({ vocabularyId: z.string().min(1), senseId: z.string().min(1).nullable(), newWord: z.object({ word: z.string().trim().min(1).max(300), reading: z.string().trim().max(500), meaning: z.string().trim().min(1, '请填写新单词的释义').max(2000), partOfSpeech: z.string().trim().max(100) }).optional() })).min(1, '请选择关联单词').max(20),
  contextSentence: z.string().trim().max(10000),
  sourceType: z.enum(['AUDIO_DIALOGUE', 'MEDIA_SUBTITLE_LINE', 'ARTICLE_TEXT', 'QUIZ_QUESTION']),
  sourceId: z.string().trim().max(300),
}).refine(value => new Set(value.targets.map(t => t.vocabularyId)).size === value.targets.length, '不能重复选择同一单词')

export type SelectionAttributeInput = z.infer<typeof selectionAttributeSchema>

/** Only restore an inflected final verb/adjective; retain particles and original spelling. */
export function suggestSelectionAttribute(text: string, lexicon: Record<string, SudachiLexeme>) {
  const lexemes = Object.values(lexicon)
  const tail = lexemes.filter(item => ['動詞', '形容詞'].includes(item.partsOfSpeech[0]) && text.endsWith(item.surface))
    .sort((a, b) => b.surface.length - a.surface.length)[0]
  const expression = tail ? text.slice(0, -tail.surface.length) + tail.dictionaryForm : text
  const terms = [...new Set(lexemes.filter(item => ['名詞', '動詞', '形容詞', '形状詞', '副詞'].includes(item.partsOfSpeech[0]))
    .flatMap(item => [item.surface, item.dictionaryForm, item.normalizedForm]).filter(Boolean))]
  return { expression, terms }
}
