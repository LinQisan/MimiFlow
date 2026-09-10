import type {
  FolderItem,
  SentenceItem,
  VocabularySenseItem,
  VocabularyWordbookMembership,
  VocabItem,
} from '../types'

export type SerializedVocabularySentence = SentenceItem & { id: string }

export type SerializedVocabularySense = Omit<VocabularySenseItem, 'examples'> & {
  exampleIds: string[]
}

export type SerializedVocabularyWordbook = Pick<
  VocabularyWordbookMembership,
  'id' | 'jlpt'
>

export type SerializedVocabularyWordbookSource =
  SerializedVocabularyWordbook & {
    recordIds: string[]
    meanings: string[]
    sentenceIds: string[]
  }

export type SerializedVocabulary = Omit<
  VocabItem,
  | 'sentences'
  | 'senses'
  | 'wordbooks'
  | 'wordbookSources'
  | 'sourceType'
> & {
  sentencePool: SerializedVocabularySentence[]
  sentenceIds: string[]
  senses: SerializedVocabularySense[]
  wordbooks: SerializedVocabularyWordbook[]
  wordbookSources: SerializedVocabularyWordbookSource[]
}

/**
 * Expand the compact server payload into the existing client-side shape.
 * Every reference resolves synchronously from props, so changing list/card
 * modes never adds a request or exposes a partially-loaded vocabulary.
 */
export const hydrateVocabularyPayload = (
  groupedData: Record<string, SerializedVocabulary[]>,
  folders: FolderItem[],
): Record<string, VocabItem[]> => {
  const folderById = new Map(folders.map(folder => [folder.id, folder]))
  const membership = (
    wordbook: SerializedVocabularyWordbook,
  ): VocabularyWordbookMembership => {
    const folder = folderById.get(wordbook.id)
    return {
      id: wordbook.id,
      jlpt: wordbook.jlpt,
      name: folder?.name || '',
      pathLabel: folder ? `${folder.seriesName} / ${folder.name}` : '',
    }
  }

  return Object.fromEntries(
    Object.entries(groupedData).map(([group, items]) => [
      group,
      items.map(item => {
        const {
          sentencePool,
          sentenceIds,
          senses,
          wordbooks,
          wordbookSources,
          ...vocabulary
        } = item
        const sentenceById = new Map(
          sentencePool.map(sentence => [sentence.id, sentence]),
        )
        const resolveSentences = (ids: string[]) =>
          ids.flatMap(id => {
            const sentence = sentenceById.get(id)
            return sentence ? [sentence] : []
          })
        return {
          ...vocabulary,
          sentences: resolveSentences(sentenceIds),
          senses: senses.map(({ exampleIds, ...sense }) => ({
            ...sense,
            examples: resolveSentences(exampleIds),
          })),
          wordbooks: wordbooks.map(membership),
          wordbookSources: wordbookSources.map(
            ({ sentenceIds: sourceSentenceIds, ...source }) => ({
              ...membership(source),
              recordIds: source.recordIds,
              meanings: source.meanings,
              pronunciations: [],
              partsOfSpeech: [],
              sentences: resolveSentences(sourceSentenceIds),
            }),
          ),
        }
      }),
    ]),
  )
}
