import { buildJapaneseVocabularySearchTerms } from '../../../../utils/vocabulary/japaneseInflection.ts'

export function expressionHighlightFragments(expression: string, sentence: string) {
  const forms = buildJapaneseVocabularySearchTerms(expression)
  const candidates = [...forms, ...forms.filter(form => form.endsWith('ます')).map(form => form.slice(0, -2))]
  const comparableSentence = sentence.replace(/\s/gu, '')
  const matches = [...new Set(candidates)].filter(form => comparableSentence.includes(form.replace(/\s/gu, '')))
  return matches.filter(form => !matches.some(other => other !== form && other.startsWith(form)))
}
