const normalizeUnitTitle = (value: string) =>
  value
    .replace(/\.apkg$/i, '')
    .trim()
    .replace(/\bUnit\s*0*(\d+)\b/i, (_, number: string) =>
      `Unit${String(Number(number)).padStart(2, '0')}`,
    )

export function inferAnkiNotebookPath(deckNames: string[], fileName: string) {
  const candidates = [
    ...deckNames.flatMap(name => name.split(' / ')),
    ...fileName.replace(/\.apkg$/i, '').split('__'),
  ].map(item => item.trim()).filter(Boolean)
  const level = candidates
    .map(item => item.match(/\bN[1-5]\b/i)?.[0]?.toUpperCase())
    .find(Boolean)
  const unit = candidates.find(item => /\bUnit\s*0*\d+\b/i.test(item))
  if (!level || !unit) return ''
  return `${level}語彙トレーニング/${normalizeUnitTitle(unit)}`
}

const splitNotebookPath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .split('/')
    .map(item => item.trim())
    .filter(Boolean)

type ResolveAnkiNotebookPathInput = {
  requestedNotebookName?: string
  suggestedNotebookName?: string
  requestedSeriesTitle?: string
  requestedWordbookTitle?: string
  selectedSeriesTitle?: string
}

export function resolveAnkiNotebookPath({
  requestedNotebookName = '',
  suggestedNotebookName = '',
  requestedSeriesTitle = '',
  requestedWordbookTitle = '',
  selectedSeriesTitle = '',
}: ResolveAnkiNotebookPathInput) {
  const inferredParts = splitNotebookPath(
    requestedNotebookName || suggestedNotebookName,
  )
  const seriesTitle =
    selectedSeriesTitle.trim() ||
    requestedSeriesTitle.trim() ||
    inferredParts[0] ||
    ''
  const wordbookTitle =
    requestedWordbookTitle.trim() || inferredParts[1] || ''

  return {
    seriesTitle,
    wordbookTitle,
    notebookName:
      seriesTitle && wordbookTitle ? `${seriesTitle}/${wordbookTitle}` : '',
  }
}

export function formatAnkiWordbookSource(
  seriesTitle: string,
  wordbookTitle: string,
) {
  const parts = [seriesTitle, wordbookTitle]
    .map(item => item.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' › ') : 'Anki导入'
}
