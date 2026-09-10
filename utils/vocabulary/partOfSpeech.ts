const FILTER_ALIASES: Record<string, string> = {
  名词: '名詞',
  名詞: '名詞',
  动词: '動詞',
  動詞: '動詞',
  形容词: '形容詞',
  形容詞: '形容詞',
  い形容词: 'い形容詞',
  い形容詞: 'い形容詞',
  な形容词: 'な形容詞',
  な形容詞: 'な形容詞',
  形容动词: 'な形容詞',
  形容動詞: 'な形容詞',
  复合动词: '複合動詞',
  複合動詞: '複合動詞',
}

const PARENT_FILTERS: Record<string, string> = {
  い形容詞: '形容詞',
  な形容詞: '形容詞',
  複合動詞: '動詞',
}

const TAG_LIKE_PARTS_OF_SPEECH: Record<string, string> = {
  カタカナ: 'カタカナ語',
  カタカナ語: 'カタカナ語',
  片假名: 'カタカナ語',
  片假名词: 'カタカナ語',
  畳語: '畳語',
  接尾語: '接尾語',
  連語: '連語',
}

export const normalizeVocabularyPartOfSpeechFilter = (value: string) => {
  const normalized = value.trim()
  return FILTER_ALIASES[normalized] || normalized
}

export const getVocabularyPartOfSpeechParent = (value: string) =>
  PARENT_FILTERS[normalizeVocabularyPartOfSpeechFilter(value)] || null

export const getVocabularyTagFromPartOfSpeech = (value: string) =>
  TAG_LIKE_PARTS_OF_SPEECH[value.trim()] || null

export const getVocabularyPartOfSpeechFilterOptions = (values: string[]) =>
  Array.from(
    new Set(
      values.flatMap(value => {
        const normalized = normalizeVocabularyPartOfSpeechFilter(value)
        if (!normalized) return []
        const parent = PARENT_FILTERS[normalized]
        return parent ? [parent, normalized] : [normalized]
      }),
    ),
  )

export const matchesVocabularyPartsOfSpeech = (
  partsOfSpeech: string[],
  selectedPos: string,
) => {
  const normalizedSelectedPos =
    normalizeVocabularyPartOfSpeechFilter(selectedPos)
  return (
    normalizedSelectedPos === 'all' ||
    partsOfSpeech.some(pos => {
      const normalizedPos = normalizeVocabularyPartOfSpeechFilter(pos)
      return (
        normalizedPos === normalizedSelectedPos ||
        PARENT_FILTERS[normalizedPos] === normalizedSelectedPos
      )
    })
  )
}
