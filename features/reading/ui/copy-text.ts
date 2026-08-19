const copyWithSelectionFallback = (text: string) => {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }

  const activeElement = document.activeElement
  const selection = document.getSelection()
  const savedRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : []
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const textarea = document.createElement('textarea')

  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  Object.assign(textarea.style, {
    position: 'fixed',
    inset: '0 auto auto 0',
    width: '1px',
    height: '1px',
    padding: '0',
    border: '0',
    opacity: '0',
    fontSize: '16px',
  })
  document.body.appendChild(textarea)

  let copied = false
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true })
    }
    if (selection) {
      selection.removeAllRanges()
      savedRanges.forEach(range => selection.addRange(range))
    }
    window.scrollTo(scrollX, scrollY)
  }

  return copied
}

export async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Mobile browsers can expose the API while rejecting it on HTTP or due to permissions.
    }
  }

  if (!copyWithSelectionFallback(text)) {
    throw new Error('clipboard unavailable')
  }
}
