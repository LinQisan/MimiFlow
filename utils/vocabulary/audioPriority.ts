type VocabularyAudioCandidate = {
  wordAudio?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

const timestamp = (value: Date | string) => {
  const result = new Date(value).getTime()
  return Number.isFinite(result) ? result : 0
}

export function selectLatestVocabularyWordAudio(
  records: VocabularyAudioCandidate[],
) {
  return records
    .filter(record => Boolean(record.wordAudio?.trim()))
    .sort(
      (left, right) =>
        timestamp(right.updatedAt) - timestamp(left.updatedAt) ||
        timestamp(right.createdAt) - timestamp(left.createdAt),
    )[0]?.wordAudio || null
}
