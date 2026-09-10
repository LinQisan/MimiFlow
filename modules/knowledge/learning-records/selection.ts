import type { LearningRecordKind } from '@prisma/client'

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Match within a source already scoped to the current user. Do not use substring
 * matching for fragments: selecting a common particle must not select every note. */
export function matchesLearningRecordSelection(
  record: { kind: LearningRecordKind; title: string; sentenceText: string; fragments: string[] },
  selection: string,
  contextSentence: string,
) {
  const selected = normalize(selection)
  if (!selected) return false
  const sentence = normalize(record.sentenceText)
  const context = normalize(contextSentence)
  if (record.kind === 'SENTENCE') {
    return sentence === selected || (sentence === context && context.includes(selected))
  }
  return (sentence === context || sentence.includes(selected)) &&
    (normalize(record.title) === selected || record.fragments.some(fragment => normalize(fragment) === selected))
}
