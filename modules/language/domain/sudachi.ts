export type SudachiLexeme = {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  dictionaryReading: string
  partsOfSpeech: string[]
}

export type SudachiToken = SudachiLexeme & {
  textIndex: number
  begin: number
  end: number
}

export type VocabularyCandidate = {
  word: string
  surface: string
  reading: string
  partOfSpeech: string
  count: number
}

export type WordFrequencyRow = VocabularyCandidate & {
  documentCount: number
}

export type WordFrequencySortMode = 'learning' | 'frequency'

const CONTENT_PARTS_OF_SPEECH = new Set([
  '名詞',
  '動詞',
  '形容詞',
  '形状詞',
  '副詞',
])
const JAPANESE_WORD_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u
const LATIN_WORD_PATTERN = /^[A-Za-z]{2,}$/
const HAN_CHARACTER_PATTERN = /\p{Script=Han}/gu
const HIRAGANA_WORD_PATTERN = /^[\p{Script=Hiragana}ー]+$/u
const INTERNAL_MARKERS = new Set(['sort', '注', '中略'])

// High-frequency beginner vocabulary remains searchable, but is moved behind
// more useful study candidates in the default learning-oriented ranking.
const FOUNDATIONAL_WORDS = new Set(
  `こと もの ところ とき ため よう そう どう これ それ あれ ここ そこ あそこ
  人 人間 自分 方 今 前 後 上 下 中 外 日 時 年 月 今日 明日 昨日 毎日
  一つ 二つ 番 円 手 目 口 女 男 子供 先生 学生 学校 会社 仕事 問題 社会
  商品 魚 猫 ネコ 水 家 店 名前 話 時間 場合 必要 多く 本当 一番 筆者
  大学 世界 最近 生活 活動 大切 利用 最後 自然 相手 店長 理由 経験 日本
  車 一緒 海外 確認 環境 情報 能力 点 地元 はず
  する ある いる なる いう 言う 思う 行く 来る 見る 聞く 話す 考える
  作る 使う 出る 入る 選ぶ 書く 読む 食べる 飲む 分かる 知る 持つ つく よる 行う
  取る 待つ 帰る 始める 終わる 良い 悪い 大きい 小さい 新しい 古い
  高い 低い 長い 短い 多い 少ない 早い 遅い 近い すぐ とても あまり`.split(
    /\s+/,
  ),
)

const PART_OF_SPEECH_LABELS: Record<string, string> = {
  名詞: '名词',
  動詞: '动词',
  形容詞: '形容词',
  形状詞: '形容动词',
  副詞: '副词',
  連体詞: '连体词',
  接続詞: '连词',
  感動詞: '感叹词',
  助動詞: '助动词',
  助詞: '助词',
  接頭辞: '前缀',
  接尾辞: '后缀',
  補助記号: '符号',
}

export const translateSudachiPartOfSpeech = (partsOfSpeech: string[]) =>
  PART_OF_SPEECH_LABELS[partsOfSpeech[0] || ''] || partsOfSpeech[0] || ''

const isFoundationalWord = (word: string) =>
  FOUNDATIONAL_WORDS.has(word.normalize('NFKC').trim())

const frequencyComparator = (left: WordFrequencyRow, right: WordFrequencyRow) =>
  right.count - left.count ||
  right.documentCount - left.documentCount ||
  left.word.localeCompare(right.word, 'ja')

const learningValue = (row: WordFrequencyRow) => {
  const characters = Array.from(row.word)
  const kanjiCount = row.word.match(HAN_CHARACTER_PATTERN)?.length || 0
  const lexicalComplexity =
    Math.min(kanjiCount, 4) * 1.5 +
    Math.min(characters.length, 8) * 0.35 -
    (HIRAGANA_WORD_PATTERN.test(row.word) ? 1.5 : 0)
  return (
    Math.log2(row.count + 1) * 3 +
    Math.log2(row.documentCount + 1) * 4 +
    lexicalComplexity
  )
}

const learningComparator = (left: WordFrequencyRow, right: WordFrequencyRow) => {
  const foundationalDifference =
    Number(isFoundationalWord(left.word)) - Number(isFoundationalWord(right.word))
  if (foundationalDifference !== 0) return foundationalDifference
  return (
    learningValue(right) - learningValue(left) ||
    frequencyComparator(left, right)
  )
}

export const sortWordFrequencyRows = (
  rows: WordFrequencyRow[],
  mode: WordFrequencySortMode = 'learning',
) => [...rows].sort(mode === 'frequency' ? frequencyComparator : learningComparator)

export const isSudachiContentWord = (token: SudachiLexeme) => {
  const word = token.dictionaryForm.trim()
  const primaryPartOfSpeech = token.partsOfSpeech[0] || ''
  if (!word || word === '*' || !CONTENT_PARTS_OF_SPEECH.has(primaryPartOfSpeech)) {
    return false
  }
  if (token.partsOfSpeech[1] === '非自立可能') return false
  if (token.partsOfSpeech.includes('数詞')) return false
  const normalizedWord = word.normalize('NFKC')
  if (INTERNAL_MARKERS.has(normalizedWord.toLowerCase())) return false
  if (
    !JAPANESE_WORD_PATTERN.test(normalizedWord) &&
    !LATIN_WORD_PATTERN.test(normalizedWord)
  ) return false
  if (/^[\p{Script=Hiragana}ー]$/u.test(word)) return false
  return true
}

export const buildVocabularyCandidates = (
  tokens: SudachiToken[],
  existingWords: Iterable<string> = [],
  limit = 60,
): VocabularyCandidate[] => {
  const existing = new Set(
    Array.from(existingWords, word => word.normalize('NFKC').trim()).filter(Boolean),
  )
  const counts = new Map<string, VocabularyCandidate>()

  tokens.forEach(token => {
    if (!isSudachiContentWord(token)) return
    const word = token.dictionaryForm.normalize('NFKC').trim()
    if (existing.has(word) || existing.has(token.surface)) return
    const current = counts.get(word)
    if (current) {
      current.count += 1
      return
    }
    counts.set(word, {
      word,
      surface: token.surface,
      reading: token.dictionaryReading || token.reading,
      partOfSpeech: translateSudachiPartOfSpeech(token.partsOfSpeech),
      count: 1,
    })
  })

  return [...counts.values()]
    .sort((left, right) => {
      const foundationalDifference =
        Number(isFoundationalWord(left.word)) - Number(isFoundationalWord(right.word))
      return (
        foundationalDifference ||
        right.count - left.count ||
        left.word.localeCompare(right.word, 'ja')
      )
    })
    .slice(0, Math.max(0, limit))
}

export const buildWordFrequency = (tokens: SudachiToken[]): WordFrequencyRow[] => {
  const rows = new Map<
    string,
    VocabularyCandidate & { documentIndexes: Set<number> }
  >()

  tokens.forEach(token => {
    if (!isSudachiContentWord(token)) return
    const word = token.dictionaryForm.normalize('NFKC').trim()
    const current = rows.get(word)
    if (current) {
      current.count += 1
      current.documentIndexes.add(token.textIndex)
      return
    }
    rows.set(word, {
      word,
      surface: token.surface,
      reading: token.dictionaryReading || token.reading,
      partOfSpeech: translateSudachiPartOfSpeech(token.partsOfSpeech),
      count: 1,
      documentIndexes: new Set([token.textIndex]),
    })
  })

  return sortWordFrequencyRows([...rows.values()]
    .map(({ documentIndexes, ...row }) => ({
      ...row,
      documentCount: documentIndexes.size,
    })))
}

export const mergeWordFrequencyRows = (
  documents: WordFrequencyRow[][],
): WordFrequencyRow[] => {
  const merged = new Map<string, WordFrequencyRow>()

  documents.forEach(rows => {
    rows.forEach(row => {
      const current = merged.get(row.word)
      if (current) {
        current.count += row.count
        current.documentCount += row.documentCount
        return
      }
      merged.set(row.word, { ...row })
    })
  })

  return sortWordFrequencyRows([...merged.values()])
}
