const sanitizeAudioFolderSegment = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[<>:"|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .slice(0, 100)

export const buildVocabularyAudioFolder = (
  seriesTitle: string,
  wordbookTitle: string,
) => {
  const series = sanitizeAudioFolderSegment(seriesTitle)
  const wordbook = sanitizeAudioFolderSegment(wordbookTitle)
  if (!series || !wordbook) return ''
  return `vocabulary/${series}/${wordbook}`
}

export const collectExclusiveWordbookAudioPaths = (
  wordbookId: string,
  entries: Array<{
    wordAudio?: string | null
    wordbookIds: string[]
  }>,
  sentenceAudioPaths: Array<string | null | undefined>,
) =>
  Array.from(
    new Set([
      ...entries.flatMap(entry =>
        entry.wordAudio &&
        entry.wordbookIds.every(entryWordbookId => entryWordbookId === wordbookId)
          ? [entry.wordAudio]
          : [],
      ),
      ...sentenceAudioPaths.filter((value): value is string => Boolean(value)),
    ]),
  )
