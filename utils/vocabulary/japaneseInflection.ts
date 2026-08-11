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

const buildJapaneseSurfaceForms = (rawHeadword: string) => {
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
