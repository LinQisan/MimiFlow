export type VocabularyView = 'list' | 'card'

const relativeHref = (url: URL) => `${url.pathname}${url.search}${url.hash}`

/**
 * Build a vocabulary focus target without turning the focused word into a
 * search filter. The caller may add an explicit q separately when it is a
 * real user-entered vocabulary query.
 */
export function buildVocabularyFocusHref(id: string) {
  const params = new URLSearchParams()
  params.set('focus', id)
  params.set('view', 'card')
  return `/vocabulary?${params.toString()}`
}

/**
 * Keep URL state and the local list/card state aligned. q and all other
 * filters are preserved in both directions; focus is transient and is
 * cleared when returning to the ordinary list.
 */
export function buildVocabularyViewHref(
  href: string,
  nextView: VocabularyView,
  focusId?: string,
) {
  const url = new URL(href, 'http://localhost')
  if (nextView === 'card') {
    url.searchParams.set('view', 'card')
    if (focusId?.trim()) url.searchParams.set('focus', focusId.trim())
  } else {
    url.searchParams.delete('view')
    url.searchParams.delete('focus')
    url.searchParams.delete('edit')
  }
  return relativeHref(url)
}

export function buildWordbookEntryHref(wordbookId: string, vocabularyId: string, editing = false) {
  const params = new URLSearchParams({ wordbook: wordbookId })
  const href = buildVocabularyViewHref(`/vocabulary?${params}`, 'card', vocabularyId)
  return editing ? `${href}&edit=1` : href
}
