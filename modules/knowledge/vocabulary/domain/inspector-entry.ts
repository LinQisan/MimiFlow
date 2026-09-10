import type { VocabularyEntryDraft } from './entry'
import type { InspectorDefinition } from './inspector-definitions'

type Sense = VocabularyEntryDraft['senses'][number]
type Identified<T> = Omit<T, 'id'> & { id?: string }
type Associated<T> = Identified<T> & { senseId: string | null }

/** Complete editable content; database ownership and generated caches stay server-side. */
export type VocabularyInspectorEntryDraft = {
  id: string
  word: string
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  grammarPartOfSpeech: VocabularyEntryDraft['grammarPartOfSpeech'] | null
  transitivity: VocabularyEntryDraft['transitivity']
  conjugationType: string | null
  wordAudio: string | null
  tags: string[]
  wordbookIds: string[]
  senses: Array<{ id: string }>
  definitions: Array<InspectorDefinition & { senseId: string | null }>
  sentences: Array<Associated<Sense['examples'][number]> & {
    audioFile: string | null
    meaningIndex: number | null
  }>
  patterns: Array<Associated<Sense['patterns'][number]>>
  expressions: Array<Associated<Sense['expressions'][number]>>
  relations: Array<Associated<VocabularyEntryDraft['relations'][number]>>
  notes: Array<Associated<Sense['notes'][number]>>
}
