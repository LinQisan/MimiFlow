export const ARTICLE_TABLE_TEMPLATE = `| 团体名・实施内容 | 实施期间・次数 | 开讲场所 | 对象・定员 |
| --- | --- | --- | --- |
| 大空グループ「絵画教室」 | 4月と5月に計5回 | 市内の公園 | 市内在住者15～20人 |
| 団体名 | 期間・回数 | 場所 | 対象・定員 |`

export function insertArticleText(
  current: string,
  insertedText: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const start = Math.max(0, Math.min(selectionStart, current.length))
  const end = Math.max(start, Math.min(selectionEnd, current.length))
  const before = current.slice(0, start)
  const after = current.slice(end)
  const prefix = before && !before.endsWith('\n\n') ? '\n\n' : ''
  const suffix = after && !after.startsWith('\n\n') ? '\n\n' : ''
  const insertion = `${prefix}${insertedText}${suffix}`

  return {
    text: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  }
}
