const JAPANESE_REGEX = /[\u3040-\u30ff\u4e00-\u9fff]/

const unique = (list: string[]) =>
  Array.from(new Set(list.map(item => item.trim()).filter(Boolean)))

const normalizeWord = (raw: string) =>
  raw
    .normalize('NFKC')
    .trim()
    .replace(/^(?:[~〜～]+|\(\s*[~〜～]\s*\)|（\s*[~〜～]\s*）)+\s*/, '')
    .replace(/\s*(?:[~〜～]+|\(\s*[~〜～]\s*\)|（\s*[~〜～]\s*）)+$/, '')
    .replace(/^[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+/, '')
    .replace(/[\s"'“”‘’「」『』（）()【】\[\]{}.,!?]+$/, '')

const isJapaneseWord = (value: string) => JAPANESE_REGEX.test(value)

const GODAN_ROWS: Record<
  string,
  { i: string; a: string; e: string; o: string; ta: string; te: string }
> = {
  う: { i: 'い', a: 'わ', e: 'え', o: 'お', ta: 'った', te: 'って' },
  く: { i: 'き', a: 'か', e: 'け', o: 'こ', ta: 'いた', te: 'いて' },
  ぐ: { i: 'ぎ', a: 'が', e: 'げ', o: 'ご', ta: 'いだ', te: 'いで' },
  す: { i: 'し', a: 'さ', e: 'せ', o: 'そ', ta: 'した', te: 'して' },
  つ: { i: 'ち', a: 'た', e: 'て', o: 'と', ta: 'った', te: 'って' },
  ぬ: { i: 'に', a: 'な', e: 'ね', o: 'の', ta: 'んだ', te: 'んで' },
  ぶ: { i: 'び', a: 'ば', e: 'べ', o: 'ぼ', ta: 'んだ', te: 'んで' },
  む: { i: 'み', a: 'ま', e: 'め', o: 'も', ta: 'んだ', te: 'んで' },
  る: { i: 'り', a: 'ら', e: 'れ', o: 'ろ', ta: 'った', te: 'って' },
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
    `${stem}られる`,
    `${stem}られない`,
    `${stem}させる`,
    `${stem}れば`,
    `${stem}よう`,
    `${stem}ろ`,
    `${stem}たい`,
  ]
}

const buildGodanForms = (word: string) => {
  const ending = word.slice(-1)
  const rule = GODAN_ROWS[ending]
  if (!rule || word.length < 2) return []
  const stem = word.slice(0, -1)
  const masuStem = `${stem}${rule.i}`
  const naiStem = `${stem}${rule.a}`
  const past = word.endsWith('行く') ? `${stem}った` : `${stem}${rule.ta}`
  const connective = word.endsWith('行く') ? `${stem}って` : `${stem}${rule.te}`
  return [
    word,
    past,
    connective,
    `${past}り`,
    `${naiStem}ない`,
    `${naiStem}なかった`,
    `${masuStem}ます`,
    `${masuStem}ました`,
    `${masuStem}ません`,
    `${masuStem}ませんでした`,
    `${connective}いる`,
    `${connective}いた`,
    `${naiStem}れる`,
    `${naiStem}れない`,
    `${naiStem}せる`,
    `${stem}${rule.e}ば`,
    `${stem}${rule.e}`,
    `${stem}${rule.o}う`,
    `${masuStem}たい`,
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
      `${stem}される`,
      `${stem}されない`,
      `${stem}させる`,
      `${stem}すれば`,
      `${stem}しよう`,
      `${stem}したい`,
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
      `${stem}こられる`,
      `${stem}こさせる`,
      `${stem}くれば`,
      `${stem}こよう`,
    ].forEach(item => forms.add(item))
    return unique(Array.from(forms))
  }

  if (word.endsWith('来る')) {
    const stem = word.slice(0, -2)
    ;[
      `${stem}来る`,
      `${stem}来た`,
      `${stem}来て`,
      `${stem}来ない`,
      `${stem}来なかった`,
      `${stem}来ます`,
      `${stem}来ました`,
      `${stem}来ません`,
      `${stem}来られる`,
      `${stem}来させる`,
      `${stem}来れば`,
      `${stem}来よう`,
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
      `${stem}く`,
    ].forEach(item => forms.add(item))
  }

  buildIchidanForms(word).forEach(item => forms.add(item))
  buildGodanForms(word).forEach(item => forms.add(item))

  return unique(Array.from(forms))
}

export const buildJapaneseVocabularySearchTerms = (
  rawHeadword: string,
  partsOfSpeech: string[] = [],
) => {
  const headword = normalizeWord(rawHeadword).slice(0, 80)
  if (!headword) return []
  const tags = partsOfSpeech.map(item => item.trim()).filter(Boolean)
  const isVerb = tags.some(tag => /動詞|动词|verb/i.test(tag))
  const isIAdjective = tags.some(
    tag => /形容詞|形容词|i-adjective|adjective|adj\./i.test(tag),
  )
  const mayBeDictionaryVerb =
    tags.length === 0 && /(?:する|くる|来る|[うくぐすつぬぶむる])$/.test(headword)

  if (!isVerb && !isIAdjective && !mayBeDictionaryVerb) return [headword]
  return buildJapaneseSurfaceForms(headword)
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

export const resolveJapaneseTargetSurface = (
  text: string,
  targetWord: string,
) => {
  const target = targetWord.normalize('NFKC').trim()
  if (!target || text.includes(target)) return target

  const targetCharacters = Array.from(target)
  if (targetCharacters.length < 3) return target

  const editDistance = (left: string[], right: string[]) => {
    let previous = right.map((_, index) => index + 1)
    previous.unshift(0)

    left.forEach((leftCharacter, leftIndex) => {
      const current = [leftIndex + 1]
      right.forEach((rightCharacter, rightIndex) => {
        current.push(
          Math.min(
            current[rightIndex] + 1,
            previous[rightIndex + 1] + 1,
            previous[rightIndex] +
              (leftCharacter === rightCharacter ? 0 : 1),
          ),
        )
      })
      previous = current
    })

    return previous[right.length]
  }

  const minimumCandidateLength = Math.max(2, targetCharacters.length - 1)
  const maximumCandidateLength = targetCharacters.length + 1
  const maximumDistance = Math.max(1, Math.floor(targetCharacters.length / 3))
  const minimumSharedPrefix = Math.max(2, Math.ceil(targetCharacters.length / 2))
  let bestMatch:
    | { surface: string; distance: number; lengthDifference: number }
    | undefined

  for (const run of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヵヶ]+/gu)) {
    const runCharacters = Array.from(run[0])
    for (let length = minimumCandidateLength; length <= maximumCandidateLength; length += 1) {
      for (let start = 0; start + length <= runCharacters.length; start += 1) {
        const candidate = runCharacters.slice(start, start + length)
        let sharedPrefix = 0
        while (
          sharedPrefix < candidate.length &&
          sharedPrefix < targetCharacters.length &&
          candidate[sharedPrefix] === targetCharacters[sharedPrefix]
        ) {
          sharedPrefix += 1
        }
        if (sharedPrefix < minimumSharedPrefix) continue

        const distance = editDistance(targetCharacters, candidate)
        if (distance > maximumDistance) continue
        const lengthDifference = Math.abs(candidate.length - targetCharacters.length)
        if (
          !bestMatch ||
          distance < bestMatch.distance ||
          (distance === bestMatch.distance &&
            lengthDifference < bestMatch.lengthDifference)
        ) {
          bestMatch = {
            surface: candidate.join(''),
            distance,
            lengthDifference,
          }
        }
      }
    }
  }

  return bestMatch?.surface || target
}

const resolveInflectedPronunciation = (
  surface: string,
  base: string,
  pronunciation: string,
) => {
  if (surface === base) return pronunciation

  const replaceReadingEnding = (baseEnding: string, surfaceEnding: string) => {
    if (!baseEnding || !pronunciation.endsWith(baseEnding)) return ''
    return `${pronunciation.slice(0, -baseEnding.length)}${surfaceEnding}`
  }

  // Irregular verbs whose conjugating ending contains more than one kana.
  for (const ending of ['する', 'くる']) {
    if (!base.endsWith(ending)) continue
    const stem = base.slice(0, -ending.length)
    if (!surface.startsWith(stem)) continue
    const resolved = replaceReadingEnding(ending, surface.slice(stem.length))
    if (resolved) return resolved
  }

  // Godan verbs, ichidan verbs and i-adjectives all expose their changing
  // kana at the end of the dictionary form. Replace that kana in the reading
  // with the surface ending generated for the inflected form.
  const baseEnding = base.slice(-1)
  const stem = base.slice(0, -1)
  if (baseEnding && surface.startsWith(stem)) {
    const resolved = replaceReadingEnding(
      baseEnding,
      surface.slice(stem.length),
    )
    if (resolved) return resolved
  }

  return pronunciation
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
    const basePronunciation =
      (pronunciationMap[surface] || pronunciationMap[base] || '').trim()
    if (!basePronunciation) return
    out[surface] = pronunciationMap[surface]
      ? basePronunciation
      : resolveInflectedPronunciation(surface, base, basePronunciation)
  })
  return out
}

export type JapaneseInflection = {
  surface: string
  lemma: string
}

const hasJapaneseText = (value: string) =>
  /[\u3040-\u30ff\u4e00-\u9fff]/.test(value)

const findLongestSurface = (
  sentenceText: string,
  lemma: string,
  surfaces: string[],
): JapaneseInflection | null => {
  const surface = Array.from(new Set(surfaces))
    .filter(item => item && item !== lemma && sentenceText.includes(item))
    .sort((left, right) => right.length - left.length)[0]
  return surface ? { surface, lemma } : null
}

export const detectJapaneseInflection = ({
  word,
  sentenceText,
  partsOfSpeech,
}: {
  word: string
  sentenceText: string
  partsOfSpeech?: string[]
}): JapaneseInflection | null => {
  const cleanWord = word.normalize('NFKC').trim()
  const tags = (partsOfSpeech || []).map(item => item.trim()).filter(Boolean)
  if (!cleanWord || !sentenceText || !hasJapaneseText(cleanWord)) return null

  const isVerb = tags.some(tag => tag.includes('動詞') || /verb/i.test(tag))
  const isIAdjective = tags.some(
    tag =>
      (tag.includes('形容詞') && !tag.includes('形容動詞')) ||
      /(?:^|\b)(?:i-adjective|adjective|adj\.)(?:\b|$)/i.test(tag),
  )
  const isNaAdjective = tags.some(
    tag => tag.includes('形容動詞') || /na-adjective/i.test(tag),
  )

  if (isVerb) {
    const explicitSuruLemma = cleanWord.endsWith('する')
    const kanjiSuruStem = /^[\u3400-\u9fff々]+$/.test(cleanWord)
    if (explicitSuruLemma || kanjiSuruStem) {
      const stem = explicitSuruLemma ? cleanWord.slice(0, -2) : cleanWord
      const lemma = `${stem}する`
      const endings = [
        'しませんでした',
        'していませんでした',
        'していました',
        'しています',
        'しなかった',
        'されました',
        'しました',
        'していた',
        'している',
        'しません',
        'される',
        'された',
        'します',
        'しない',
        'して',
        'した',
      ]
      const detected = findLongestSurface(
        sentenceText,
        lemma,
        endings.map(ending => `${stem}${ending}`),
      )
      if (detected) return detected
    }
  }

  if (isIAdjective && cleanWord.endsWith('い') && cleanWord.length > 1) {
    const stem = cleanWord.slice(0, -1)
    const detected = findLongestSurface(sentenceText, cleanWord, [
      `${stem}くなかった`,
      `${stem}くありません`,
      `${stem}くない`,
      `${stem}かった`,
      `${stem}くて`,
      `${stem}く`,
    ])
    if (detected) return detected
  }

  if (isNaAdjective) {
    return findLongestSurface(sentenceText, cleanWord, [
      `${cleanWord}ではありませんでした`,
      `${cleanWord}じゃなかった`,
      `${cleanWord}ではなかった`,
      `${cleanWord}ではない`,
      `${cleanWord}じゃない`,
      `${cleanWord}でした`,
      `${cleanWord}だった`,
      `${cleanWord}です`,
      `${cleanWord}だ`,
      `${cleanWord}な`,
      `${cleanWord}に`,
    ])
  }

  return null
}
