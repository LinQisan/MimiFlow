import { buildVocabularyCanonicalKeys } from './vocabularyCanonical'
import type { VocabularyMeta } from './vocabularyMeta'

const JAPANESE_REGEX = /[\u3040-\u30ff\u4e00-\u9fff]/

const unique = (list: string[]) =>
  Array.from(new Set(list.map(item => item.trim()).filter(Boolean)))

const normalizeWord = (raw: string) =>
  raw
    .normalize('NFKC')
    .trim()
    .replace(/^[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+/, '')
    .replace(/[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+$/, '')

const isJapaneseWord = (value: string) => JAPANESE_REGEX.test(value)

const pushGodanFromTaStem = (stem: string, out: Set<string>) => {
  if (!stem) return
  out.add(`${stem}る`)
  if (stem.endsWith('っ')) {
    const base = stem.slice(0, -1)
    out.add(`${base}う`)
    out.add(`${base}つ`)
    out.add(`${base}る`)
    return
  }
  if (stem.endsWith('い')) {
    const base = stem.slice(0, -1)
    out.add(`${base}く`)
    out.add(`${base}ぐ`)
    return
  }
  if (stem.endsWith('し')) {
    out.add(`${stem.slice(0, -1)}す`)
    return
  }
  if (stem.endsWith('ん')) {
    const base = stem.slice(0, -1)
    out.add(`${base}む`)
    out.add(`${base}ぶ`)
    out.add(`${base}ぬ`)
  }
}

const pushGodanFromTeStem = (stem: string, out: Set<string>) => {
  if (!stem) return
  out.add(`${stem}る`)
  if (stem.endsWith('っ')) {
    const base = stem.slice(0, -1)
    out.add(`${base}う`)
    out.add(`${base}つ`)
    out.add(`${base}る`)
    return
  }
  if (stem.endsWith('い')) {
    const base = stem.slice(0, -1)
    out.add(`${base}く`)
    out.add(`${base}ぐ`)
    return
  }
  if (stem.endsWith('し')) {
    out.add(`${stem.slice(0, -1)}す`)
    return
  }
  if (stem.endsWith('ん')) {
    const base = stem.slice(0, -1)
    out.add(`${base}む`)
    out.add(`${base}ぶ`)
    out.add(`${base}ぬ`)
  }
}

const I_TO_U: Record<string, string> = {
  い: 'う',
  き: 'く',
  ぎ: 'ぐ',
  し: 'す',
  ち: 'つ',
  に: 'ぬ',
  び: 'ぶ',
  み: 'む',
  り: 'る',
}

const A_TO_U: Record<string, string> = {
  わ: 'う',
  か: 'く',
  が: 'ぐ',
  さ: 'す',
  た: 'つ',
  な: 'ぬ',
  ば: 'ぶ',
  ま: 'む',
  ら: 'る',
}

const deinflectJapaneseWord = (rawWord: string) => {
  const word = normalizeWord(rawWord)
  const out = new Set<string>()
  if (!word || !isJapaneseWord(word)) return [word].filter(Boolean)
  out.add(word)

  const appendMasuStem = (stem: string) => {
    if (!stem) return
    out.add(`${stem}る`)
    const last = stem.slice(-1)
    const mapped = I_TO_U[last]
    if (mapped) out.add(`${stem.slice(0, -1)}${mapped}`)
    if (stem.endsWith('し')) out.add(`${stem.slice(0, -1)}する`)
    if (stem === 'し') out.add('する')
    if (stem === 'き') out.add('くる')
  }

  const appendNaiStem = (stem: string) => {
    if (!stem) return
    out.add(`${stem}る`)
    const last = stem.slice(-1)
    const mapped = A_TO_U[last]
    if (mapped) out.add(`${stem.slice(0, -1)}${mapped}`)
    if (stem.endsWith('し')) out.add(`${stem.slice(0, -1)}する`)
    if (stem === 'し') out.add('する')
    if (stem === 'こ') out.add('くる')
  }

  const masuSuffixes = ['ませんでした', 'ました', 'ません', 'ます']
  for (const suffix of masuSuffixes) {
    if (!word.endsWith(suffix) || word.length <= suffix.length) continue
    appendMasuStem(word.slice(0, -suffix.length))
  }

  const naiSuffixes = ['なかった', 'ない']
  for (const suffix of naiSuffixes) {
    if (!word.endsWith(suffix) || word.length <= suffix.length) continue
    appendNaiStem(word.slice(0, -suffix.length))
  }

  if (word.endsWith('たり') && word.length > 2) {
    pushGodanFromTaStem(word.slice(0, -2), out)
  }
  if (word.endsWith('だり') && word.length > 2) {
    pushGodanFromTaStem(word.slice(0, -2), out)
  }
  if (word.endsWith('た') && word.length > 1) {
    pushGodanFromTaStem(word.slice(0, -1), out)
  }
  if (word.endsWith('だ') && word.length > 1) {
    pushGodanFromTaStem(word.slice(0, -1), out)
  }
  if (word.endsWith('て') && word.length > 1) {
    pushGodanFromTeStem(word.slice(0, -1), out)
  }
  if (word.endsWith('で') && word.length > 1) {
    pushGodanFromTeStem(word.slice(0, -1), out)
  }

  const suruPattern =
    /^(.*)し(ませんでした|ました|ません|ます|なかった|ない|たり|た|て)$/
  const suruMatch = word.match(suruPattern)
  if (suruMatch && suruMatch[1] !== undefined) {
    out.add(`${suruMatch[1]}する`)
  }
  if (word === 'した' || word === 'して' || word === 'しない') out.add('する')
  if (word === 'きた' || word === 'きて' || word === 'こない') out.add('くる')

  return unique(Array.from(out))
}

const GODAN_ROWS: Record<
  string,
  { i: string; a: string; ta: string; te: string }
> = {
  う: { i: 'い', a: 'わ', ta: 'った', te: 'って' },
  く: { i: 'き', a: 'か', ta: 'いた', te: 'いて' },
  ぐ: { i: 'ぎ', a: 'が', ta: 'いだ', te: 'いで' },
  す: { i: 'し', a: 'さ', ta: 'した', te: 'して' },
  つ: { i: 'ち', a: 'た', ta: 'った', te: 'って' },
  ぬ: { i: 'に', a: 'な', ta: 'んだ', te: 'んで' },
  ぶ: { i: 'び', a: 'ば', ta: 'んだ', te: 'んで' },
  む: { i: 'み', a: 'ま', ta: 'んだ', te: 'んで' },
  る: { i: 'り', a: 'ら', ta: 'った', te: 'って' },
}

const buildIchidanForms = (word: string) => {
  if (!word.endsWith('る') || word.length < 2) return []
  const stem = word.slice(0, -1)
  return [
    word,
    `${stem}た`,
    `${stem}て`,
    `${stem}たり`,
    `${stem}ない`,
    `${stem}なかった`,
    `${stem}ます`,
    `${stem}ました`,
    `${stem}ません`,
    `${stem}ませんでした`,
    `${stem}ている`,
    `${stem}ていた`,
  ]
}

const buildGodanForms = (word: string) => {
  const ending = word.slice(-1)
  const rule = GODAN_ROWS[ending]
  if (!rule || word.length < 2) return []
  const stem = word.slice(0, -1)
  const masuStem = `${stem}${rule.i}`
  const naiStem = `${stem}${rule.a}`
  return [
    word,
    `${stem}${rule.ta}`,
    `${stem}${rule.te}`,
    `${stem}${rule.ta}り`,
    `${naiStem}ない`,
    `${naiStem}なかった`,
    `${masuStem}ます`,
    `${masuStem}ました`,
    `${masuStem}ません`,
    `${masuStem}ませんでした`,
    `${stem}${rule.te}いる`,
    `${stem}${rule.te}いた`,
  ]
}

export const buildJapaneseSurfaceForms = (rawHeadword: string) => {
  const word = normalizeWord(rawHeadword)
  if (!word || !isJapaneseWord(word)) return [word].filter(Boolean)

  const forms = new Set<string>()
  forms.add(word)

  if (word.endsWith('する')) {
    const stem = word.slice(0, -2)
    ;[
      `${stem}する`,
      `${stem}した`,
      `${stem}して`,
      `${stem}しない`,
      `${stem}しなかった`,
      `${stem}します`,
      `${stem}しました`,
      `${stem}しません`,
      `${stem}しませんでした`,
      `${stem}したり`,
    ].forEach(item => forms.add(item))
    return unique(Array.from(forms))
  }

  if (word.endsWith('くる') || word === 'くる') {
    const stem = word === 'くる' ? '' : word.slice(0, -2)
    ;[
      `${stem}くる`,
      `${stem}きた`,
      `${stem}きて`,
      `${stem}こない`,
      `${stem}こなかった`,
      `${stem}きます`,
      `${stem}きました`,
      `${stem}きません`,
      `${stem}きませんでした`,
      `${stem}きたり`,
    ].forEach(item => forms.add(item))
    return unique(Array.from(forms))
  }

  if (word.endsWith('い')) {
    const stem = word.slice(0, -1)
    ;[
      word,
      `${stem}かった`,
      `${stem}くない`,
      `${stem}くなかった`,
      `${stem}くて`,
    ].forEach(item => forms.add(item))
  }

  buildIchidanForms(word).forEach(item => forms.add(item))
  buildGodanForms(word).forEach(item => forms.add(item))

  return unique(Array.from(forms))
}

export const buildSurfaceAliasMapForText = (text: string, words: string[]) => {
  const normalizedText = text || ''
  if (!normalizedText) return {}
  const sortedWords = unique(words).sort((a, b) => b.length - a.length)
  const alias = new Map<string, string>()

  for (const baseWord of sortedWords) {
    const normalizedBase = normalizeWord(baseWord)
    if (!normalizedBase) continue
    if (normalizedText.includes(normalizedBase) && !alias.has(normalizedBase)) {
      alias.set(normalizedBase, normalizedBase)
    }
    if (!isJapaneseWord(normalizedBase)) continue
    const forms = buildJapaneseSurfaceForms(normalizedBase)
    for (const form of forms) {
      if (!form || !normalizedText.includes(form) || alias.has(form)) continue
      alias.set(form, normalizedBase)
    }
  }

  return Object.fromEntries(alias)
}

export const buildPronunciationMapForText = (
  text: string,
  pronunciationMap: Record<string, string>,
) => {
  const words = Object.keys(pronunciationMap)
  if (words.length === 0) return {}
  const aliasMap = buildSurfaceAliasMapForText(text, words)
  const out: Record<string, string> = {}
  Object.entries(aliasMap).forEach(([surface, base]) => {
    const pronunciation =
      (pronunciationMap[surface] || pronunciationMap[base] || '').trim()
    if (!pronunciation) return
    out[surface] = pronunciation
  })
  return out
}

export const resolveVocabularyMetaForSelection = (
  rawSelection: string,
  vocabularyMetaMap: Record<string, VocabularyMeta>,
) => {
  const selection = normalizeWord(rawSelection)
  if (!selection) return null

  const exact = vocabularyMetaMap[selection]
  if (exact) return { word: selection, meta: exact, matchedBy: 'exact' as const }

  const candidates = deinflectJapaneseWord(selection)
  for (const candidate of candidates) {
    const hit = vocabularyMetaMap[candidate]
    if (hit) {
      return { word: candidate, meta: hit, matchedBy: 'deinflect' as const }
    }
  }

  const targetKeys = new Set(
    unique(
      candidates.flatMap(item => buildVocabularyCanonicalKeys(item)),
    ),
  )
  if (targetKeys.size === 0) return null

  let bestWord = ''
  let bestMeta: VocabularyMeta | null = null
  let bestScore = 0

  Object.entries(vocabularyMetaMap).forEach(([word, meta]) => {
    const keys = buildVocabularyCanonicalKeys(word)
    const overlap = keys.filter(key => targetKeys.has(key)).length
    if (overlap === 0) return
    const bonus = candidates.includes(word) ? 20 : 0
    const score = overlap * 10 + bonus - Math.abs(word.length - selection.length)
    if (score > bestScore) {
      bestScore = score
      bestWord = word
      bestMeta = meta
    }
  })

  if (!bestMeta) return null
  return { word: bestWord, meta: bestMeta, matchedBy: 'canonical' as const }
}
