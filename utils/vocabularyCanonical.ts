import { guessLanguageCode } from '@/utils/langDetector'

const unique = (list: string[]) => Array.from(new Set(list.filter(Boolean)))

const normalizeRawWord = (raw: string) =>
  raw
    .normalize('NFKC')
    .trim()
    .replace(/^[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+/, '')
    .replace(/[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+$/, '')

const buildEnglishKeys = (word: string) => {
  const base = word.toLowerCase()
  const keys = [base]
  if (base.endsWith('ies') && base.length > 4) keys.push(`${base.slice(0, -3)}y`)
  if (base.endsWith('ied') && base.length > 4) keys.push(`${base.slice(0, -3)}y`)
  if (base.endsWith('es') && base.length > 4) keys.push(base.slice(0, -2))
  if (base.endsWith('s') && base.length > 3) keys.push(base.slice(0, -1))
  if (base.endsWith('ed') && base.length > 4) {
    keys.push(base.slice(0, -2))
    keys.push(`${base.slice(0, -2)}e`)
  }
  if (base.endsWith('ing') && base.length > 5) {
    keys.push(base.slice(0, -3))
    keys.push(`${base.slice(0, -3)}e`)
  }
  return unique(keys.filter(item => item.length >= 2))
}

const buildJapaneseKeys = (word: string) => {
  const base = normalizeRawWord(word)
  const keys = [base]
  const suffixes = [
    'ませんでした',
    'なかった',
    'でした',
    'だった',
    'ました',
    'ません',
    'ている',
    'ていた',
    'られる',
    'れる',
    'ない',
    'たい',
    'ます',
    'です',
    'だ',
    'た',
    'て',
  ]

  suffixes.forEach(suffix => {
    if (!base.endsWith(suffix) || base.length <= suffix.length + 1) return
    const stem = base.slice(0, -suffix.length)
    keys.push(stem)
    if (suffix === 'ました' || suffix === 'ます' || suffix === 'ません') {
      keys.push(`${stem}る`)
    }
    if (suffix === 'なかった' || suffix === 'ない') {
      keys.push(`${stem}い`)
    }
  })

  // する动词变形归并（します/した/して/しない 等 -> する）
  const suruSuffixes = [
    'しませんでした',
    'しなかった',
    'しました',
    'しません',
    'します',
    'しない',
    'して',
    'した',
    'しろ',
    'せよ',
  ]
  suruSuffixes.forEach(suffix => {
    if (!base.endsWith(suffix) || base.length <= suffix.length) return
    const stem = base.slice(0, -suffix.length)
    keys.push(`${stem}する`)
  })
  if (base === 'します' || base === 'した' || base === 'して') {
    keys.push('する')
  }

  return unique(keys.filter(item => item.length >= 1))
}

const normalizeJapaneseVerbHeadword = (word: string) => {
  const base = normalizeRawWord(word)
  if (!base) return base
  const suruSuffixes = [
    'しませんでした',
    'しなかった',
    'しました',
    'しません',
    'します',
    'しない',
    'して',
    'した',
    'しろ',
    'せよ',
  ]
  for (const suffix of suruSuffixes) {
    if (!base.endsWith(suffix) || base.length <= suffix.length) continue
    return `${base.slice(0, -suffix.length)}する`
  }
  if (base === 'します' || base === 'した' || base === 'して') return 'する'
  return base
}

const normalizeJapaneseAdjectiveHeadword = (word: string) => {
  const base = normalizeRawWord(word)
  if (!base) return base

  const iAdjSuffixes = ['くなかった', 'くない', 'かった', 'くて', 'く']
  for (const suffix of iAdjSuffixes) {
    if (!base.endsWith(suffix) || base.length <= suffix.length) continue
    return `${base.slice(0, -suffix.length)}い`
  }

  const naAdjSuffixes = ['でした', 'ではない', 'じゃない', 'だった', 'です', 'だ', 'な', 'に']
  for (const suffix of naAdjSuffixes) {
    if (!base.endsWith(suffix) || base.length <= suffix.length) continue
    return base.slice(0, -suffix.length)
  }

  return base
}

export const normalizeVocabularyHeadword = (
  rawWord: string,
  partsOfSpeech: string[] = [],
) => {
  const normalized = normalizeRawWord(rawWord)
  if (!normalized) return ''
  const lang = guessLanguageCode(normalized)
  const hasJapanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(normalized)
  const isVerb = partsOfSpeech.some(
    item => item.includes('動詞') || /verb/i.test(item),
  )
  const isAdjective = partsOfSpeech.some(
    item => item.includes('形容詞') || item.includes('形容動詞') || /adjective|adj\./i.test(item),
  )
  if (isVerb && (lang === 'ja' || hasJapanese)) {
    return normalizeJapaneseVerbHeadword(normalized)
  }
  if (isAdjective && (lang === 'ja' || hasJapanese)) {
    return normalizeJapaneseAdjectiveHeadword(normalized)
  }
  return normalized
}

export const buildVocabularyCanonicalKeys = (rawWord: string) => {
  const normalized = normalizeRawWord(rawWord)
  if (!normalized) return []
  const lang = guessLanguageCode(normalized)
  if (lang === 'en') return buildEnglishKeys(normalized)
  if (lang === 'ja' || /[\u3040-\u30ff\u4e00-\u9fff]/.test(normalized)) {
    return buildJapaneseKeys(normalized)
  }
  return [normalized.toLowerCase()]
}

export const isLikelySameVocabulary = (left: string, right: string) => {
  const leftKeys = new Set(buildVocabularyCanonicalKeys(left))
  const rightKeys = new Set(buildVocabularyCanonicalKeys(right))
  if (leftKeys.size === 0 || rightKeys.size === 0) return false
  for (const key of leftKeys) {
    if (rightKeys.has(key)) return true
  }
  return false
}
