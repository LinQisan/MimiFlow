const JLPT_LISTENING_SECTION_LABELS: Record<number, string> = {
  1: '課題理解',
  2: 'ポイント理解',
  3: '概要理解',
  4: '即時応答',
  5: '統合理解',
}

export type JlptListeningIdentity = {
  level: string | null
  session: string | null
  sectionNumber: number
  questionNumber: number
  sectionLabel: string
}

const toPositiveInteger = (value: string | undefined) => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseJlptListeningIdentity(
  value: string,
): JlptListeningIdentity | null {
  const normalized = value
    .normalize('NFKC')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()

  const canonical = normalized.match(
    /(?:^|[^0-9])(20\d{2})[-_]?((?:0?[1-9])|1[0-2])[-_]?N([1-5])[-_](?:P|L)(\d{1,2})[-_]Q(\d{1,2})(?:$|[^0-9])/i,
  )
  if (canonical) {
    const sectionNumber = toPositiveInteger(canonical[4])
    const questionNumber = toPositiveInteger(canonical[5])
    if (!sectionNumber || !questionNumber) return null
    return {
      level: `N${canonical[3]}`.toUpperCase(),
      session: `${canonical[1]}-${canonical[2].padStart(2, '0')}`,
      sectionNumber,
      questionNumber,
      sectionLabel:
        JLPT_LISTENING_SECTION_LABELS[sectionNumber] || `問題${sectionNumber}`,
    }
  }

  const title = normalized.match(/問題\s*(\d{1,2})\s*[-_・第]?\s*(?:第)?(\d{1,2})(?:問)?/i)
  if (!title) return null
  const sectionNumber = toPositiveInteger(title[1])
  const questionNumber = toPositiveInteger(title[2])
  if (!sectionNumber || !questionNumber) return null
  return {
    level: null,
    session: null,
    sectionNumber,
    questionNumber,
    sectionLabel:
      JLPT_LISTENING_SECTION_LABELS[sectionNumber] || `問題${sectionNumber}`,
  }
}

export function formatJlptListeningTitle(identity: JlptListeningIdentity) {
  return `問題${identity.sectionNumber}-${String(identity.questionNumber).padStart(2, '0')}｜${identity.sectionLabel}`
}
