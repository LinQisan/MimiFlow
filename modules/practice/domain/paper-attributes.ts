import { MaterialType } from '@prisma/client'

export const PAPER_ACCEPTED_MATERIAL_TYPES: MaterialType[] = [
  MaterialType.LISTENING,
  MaterialType.READING,
  MaterialType.VOCAB_GRAMMAR,
]

function inferPaperLanguage(title: string, language?: string | null) {
  const explicit = (language || '').trim().toLowerCase()
  if (explicit) return explicit
  if (/TOEIC/i.test(title)) return 'en'
  if (/(?:^|\s|年|月)N[1-5](?:\s|$)/i.test(title) || /JLPT/i.test(title)) {
    return 'ja'
  }
  return null
}

function inferPaperLevel(title: string, level?: string | null) {
  const explicit = (level || '').trim().toUpperCase()
  if (explicit) return explicit
  const jlptLevel = title.match(/(?:^|\s|年|月)(N[1-5])(?:\s|$)/i)?.[1]
  if (jlptLevel) return jlptLevel.toUpperCase()
  if (/TOEIC/i.test(title)) return 'TOEIC'
  return null
}

export function normalizePaperAttributes(input: {
  title: string
  language?: string | null
  level?: string | null
}) {
  return {
    language: inferPaperLanguage(input.title, input.language),
    level: inferPaperLevel(input.title, input.level),
    acceptedMaterialTypes: PAPER_ACCEPTED_MATERIAL_TYPES,
  }
}
