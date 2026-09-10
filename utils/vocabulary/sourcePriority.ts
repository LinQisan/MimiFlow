export function getVocabularySeriesPriority(seriesTitle: string) {
  const normalizedTitle = seriesTitle.normalize('NFKC').trim()
  if (/N[1-5]語彙トレーニング/u.test(normalizedTitle)) return 0
  if (normalizedTitle === '红宝书') return 1
  return 2
}

export function getVocabularyRecordPriority(seriesTitles: string[]) {
  return Math.min(3, ...seriesTitles.map(getVocabularySeriesPriority))
}

export function prefersAuthoredVocabularyPronunciation(
  wordbookPathLabels: string[],
) {
  return wordbookPathLabels.some(pathLabel =>
    /N[1-5]語彙トレーニング/u.test(pathLabel.normalize('NFKC')),
  )
}
