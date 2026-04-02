const normalizeComparable = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s|｜・·‧･]+/g, '')
    .trim()

export const sanitizePronunciation = (word: string, pronunciation: string) => {
  const cleanWord = word.trim()
  const cleanPron = pronunciation.trim()
  if (!cleanWord || !cleanPron) return ''
  if (normalizeComparable(cleanWord) === normalizeComparable(cleanPron)) return ''
  return cleanPron
}

export const sanitizePronunciations = (word: string, list: string[]) =>
  Array.from(
    new Set(
      list
        .map(item => sanitizePronunciation(word, item))
        .filter(Boolean),
    ),
  )
