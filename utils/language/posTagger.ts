import { guessLanguageCode } from './langDetector'
import {
  normalizeJapanesePartOfSpeech,
  normalizeSavedJapanesePartsOfSpeech,
} from './partOfSpeech'

const unique = (list: string[]) => Array.from(new Set(list.filter(Boolean)))

const EN_PRONOUNS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
  'who', 'whom', 'whose', 'which', 'that', 'someone', 'anyone', 'everyone',
])
const EN_DETERMINERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'some', 'any', 'many',
  'much', 'few', 'little', 'each', 'every', 'no', 'another',
])
const EN_PREPOSITIONS = new Set([
  'in', 'on', 'at', 'by', 'for', 'to', 'from', 'of', 'with', 'about', 'into',
  'over', 'after', 'before', 'under', 'between', 'through', 'during', 'without',
  'within', 'as', 'against', 'toward', 'upon', 'around',
])
const EN_CONJUNCTIONS = new Set([
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while', 'although',
  'though', 'unless', 'since', 'whereas', 'than',
])
const JA_PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'や', 'の', 'か', 'ね', 'よ',
  'から', 'まで', 'より', 'しか', 'でも', 'ばかり', 'だけ', 'ほど',
])
const JA_AUX = new Set([
  'です', 'だ', 'でした', 'だった', 'である', 'ます', 'ました', 'ない', 'たい',
  'れる', 'られる', 'せる', 'させる',
])
const JA_CONJ = new Set(['そして', 'しかし', 'または', 'だから', 'なので', 'けれども'])
const JA_INTERJ = new Set(['ああ', 'ええ', 'おお', 'はい', 'いいえ'])

const EN_POS_OPTIONS = [
  'n.',
  'v.',
  'adj.',
  'adv.',
  'prep.',
  'pron.',
  'det.',
  'conj.',
  'interj.',
]

const JA_POS_OPTIONS = [
  '名詞',
  '動詞',
  'い形容詞',
  'な形容詞',
  '副詞',
  '助詞',
  '助動詞',
  '連体詞',
  '接続詞',
  '感動詞',
]

const normalizeEnglishPos = (raw: string) => {
  const lower = raw.toLowerCase().trim()
  if (!lower) return ''
  if (lower.startsWith('n')) return 'n.'
  if (lower.startsWith('v')) return 'v.'
  if (lower.startsWith('adj')) return 'adj.'
  if (lower.startsWith('adv')) return 'adv.'
  if (lower.startsWith('prep')) return 'prep.'
  if (lower.startsWith('pron')) return 'pron.'
  if (lower.startsWith('det') || lower.startsWith('art')) return 'det.'
  if (lower.startsWith('conj')) return 'conj.'
  if (lower.startsWith('int')) return 'interj.'
  return raw.trim()
}

const detectLanguage = (word: string, sentence: string) => {
  if (/[A-Za-z]/.test(word)) return 'en' as const
  if (/[\u3040-\u30ff]/.test(word) || /[\u3040-\u30ff]/.test(sentence)) return 'ja' as const
  const guessed = guessLanguageCode(word)
  if (guessed === 'en' || guessed === 'ja') return guessed as 'en' | 'ja'
  return 'other' as const
}

export const getPosOptions = (word: string, sentence: string) => {
  const lang = detectLanguage(word, sentence)
  if (lang === 'ja') return JA_POS_OPTIONS
  if (lang === 'en') return EN_POS_OPTIONS
  return [...EN_POS_OPTIONS, ...JA_POS_OPTIONS]
}

const inferEnglishPos = (word: string, sentence: string) => {
  const lower = word.toLowerCase()
  const result: string[] = []
  if (EN_PRONOUNS.has(lower)) result.push('pron.')
  if (EN_DETERMINERS.has(lower)) result.push('det.')
  if (EN_PREPOSITIONS.has(lower)) result.push('prep.')
  if (EN_CONJUNCTIONS.has(lower)) result.push('conj.')
  if (['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had'].includes(lower)) {
    result.push('v.')
  }
  if (lower.endsWith('ly')) result.push('adv.')
  if (/(ing|ed|en|ize|ise|fy)$/.test(lower)) result.push('v.')
  if (/(ous|ful|able|ible|al|ic|ive|less|ary|ory)$/.test(lower)) result.push('adj.')
  if (/(tion|sion|ment|ness|ity|ism|age|ship|ance|ence)$/.test(lower)) result.push('n.')

  const tokens = sentence
    .toLowerCase()
    .split(/[^a-zA-Z']+/)
    .filter(Boolean)
  const idx = tokens.findIndex(t => t === lower)
  const prev = idx > 0 ? tokens[idx - 1] : ''
  if (EN_DETERMINERS.has(prev) && !result.includes('n.')) result.push('n.')
  if (prev === 'to' && !result.includes('v.')) result.push('v.')
  if (result.length === 0) result.push('n.')
  return unique(result).map(normalizeEnglishPos)
}

const inferJapanesePos = (word: string) => {
  const w = word.trim()
  const result: string[] = []
  if (JA_PARTICLES.has(w)) result.push('助詞')
  if (JA_AUX.has(w)) result.push('助動詞')
  if (JA_CONJ.has(w)) result.push('接続詞')
  if (JA_INTERJ.has(w)) result.push('感動詞')
  if (/(する|した|して|します|できる|できた|なる|なった)$/.test(w)) result.push('動詞')
  if (/(い)$/.test(w)) result.push('い形容詞')
  if (/(的|な)$/.test(w)) result.push('な形容詞')
  if (/(に)$/.test(w) && /[\u3040-\u30ff]/.test(w)) result.push('副詞')
  if (result.length === 0) result.push('名詞')
  return unique(result).map(normalizeJapanesePartOfSpeech)
}

export const inferContextualPos = (
  word: string,
  sentence: string,
  existingPos: string[] = [],
) => {
  const lang = detectLanguage(word, sentence)
  const normalizedExisting =
    lang === 'ja'
      ? normalizeSavedJapanesePartsOfSpeech(existingPos)
      : existingPos.map(normalizeEnglishPos)

  const saved = unique(normalizedExisting)
  if (saved.length > 0) return saved

  const inferred =
    lang === 'ja'
      ? inferJapanesePos(word)
      : lang === 'en'
        ? inferEnglishPos(word, sentence)
        : normalizedExisting

  return unique(inferred).slice(0, 3)
}
