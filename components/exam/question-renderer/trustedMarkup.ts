export const createTrustedMarkupSlots = (sourceText: string) => {
  const slots: Array<{ token: string; html: string }> = []
  let tokenIndex = 0

  const add = (html: string) => {
    let token = ''
    do {
      token = `\uE000EXAM_BLANK_${tokenIndex}\uE001`
      tokenIndex += 1
    } while (
      sourceText.includes(token) ||
      slots.some(slot => slot.html.includes(token))
    )

    slots.push({ token, html })
    return token
  }

  const restore = (renderedHtml: string) =>
    slots.reduce(
      (html, slot) => html.replaceAll(slot.token, slot.html),
      renderedHtml,
    )

  return {
    add,
    restore,
    get tokens() {
      return slots.map(slot => slot.token)
    },
  }
}
