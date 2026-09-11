/** Strip only the matching section prefix; keep authored names and numbering. */
export function normalizeQuestionSectionTitle(title: string, sectionNumber: number | null | undefined) {
  let result = title.trim()
  if (!sectionNumber || !Number.isInteger(sectionNumber) || sectionNumber < 1) return result
  const prefix = new RegExp(`^(?:問題|问题)\\s*0*${sectionNumber}(?![0-9０-９])\\s*(?:[｜|·・:：—–-]\\s*|$)`)
  let match = result.normalize('NFKC').match(prefix)
  while (match) {
    result = result.slice(match[0].length).trim()
    match = result.normalize('NFKC').match(prefix)
  }
  return result
}

export function formatQuestionSectionHeading(title: string, sectionNumber: number | null | undefined) {
  const name = normalizeQuestionSectionTitle(title, sectionNumber)
  if (!sectionNumber || !Number.isInteger(sectionNumber) || sectionNumber < 1) return name
  return name ? `問題${sectionNumber}｜${name}` : `問題${sectionNumber}`
}
