import type { VocabularyEntryDraft } from './entry.ts'
import { vocabularyEntryDraftSchema } from './entry-validation.ts'

export function serializeVocabularyEntry(draft: VocabularyEntryDraft) {
  const { vocabularyId: _id, ...content } = draft
  void _id
  return JSON.stringify(content, null, 2)
}

/** New rows may omit IDs; the current vocabulary identity is never editable. */
export function parseVocabularyEntryJson(text: string, vocabularyId: string): VocabularyEntryDraft {
  let content: unknown
  try { content = JSON.parse(text) }
  catch (error) { throw new Error(`JSON 格式错误，请检查引号、逗号和括号：${error instanceof Error ? error.message : ''}`) }
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('请填写一个词汇 JSON 对象')
  const addIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(row => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return addIds({ ...row, id: (row as { id?: string }).id || `new-${crypto.randomUUID()}` })
      }
      return row
    })
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, addIds(item)]))
    return value
  }
  const result = vocabularyEntryDraftSchema.safeParse({ ...addIds(content) as object, vocabularyId })
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => `${issue.path.join('.')}：${issue.message}`).join('\n'))
  }
  return result.data
}
