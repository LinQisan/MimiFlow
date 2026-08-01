import { Prisma } from '@prisma/client'

export type JsonRecord = Record<string, unknown>

export const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

export const asString = (value: unknown) =>
  typeof value === 'string' ? value : ''

export const asStringOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : String(value)
}

export const asNumberOrDefault = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return Math.floor(num)
  }
  return fallback
}

export const toJsonValue = (
  value: unknown,
  fallback: Prisma.InputJsonValue,
): Prisma.InputJsonValue =>
  value === undefined ? fallback : (value as Prisma.InputJsonValue)

export const toNullableJsonValue = (
  value: unknown,
):
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput
  | undefined => {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

export const shortText = (text: string, max = 96) => {
  const value = (text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

export const normalizeKeyword = (keyword: string) =>
  keyword
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const tokenizeKeyword = (keyword: string) =>
  normalizeKeyword(keyword)
    .split(' ')
    .map(item => item.trim())
    .filter(Boolean)

export const getMatchScore = (
  keyword: string,
  fields: Array<string | null | undefined>,
) => {
  const tokens = tokenizeKeyword(keyword).map(item => item.toLowerCase())
  return getMatchScoreForTokens(tokens, fields)
}

const normalizeSearchFields = (fields: Array<string | null | undefined>) =>
  fields
    .filter(Boolean)
    .map(item => String(item).toLowerCase())

const getMatchScoreForTokens = (
  tokens: string[],
  fields: Array<string | null | undefined>,
) => {
  if (tokens.length === 0) return 0
  let score = 0

  for (const value of normalizeSearchFields(fields)) {
    for (const token of tokens) {
      if (value === token) score += 120
      else if (value.startsWith(token)) score += 80
      else if (value.includes(token)) score += 40
    }
  }

  return score
}

export const includesAllTokens = (
  fields: Array<string | null | undefined>,
  tokens: string[],
) => {
  if (tokens.length === 0) return false
  const normalizedFields = normalizeSearchFields(fields)
  const normalizedTokens = tokens.map(token => token.toLowerCase())
  return normalizedTokens.every(token =>
    normalizedFields.some(field => field.includes(token)),
  )
}

export const sortByScore = <T>(
  rows: T[],
  getFields: (row: T) => Array<string | null | undefined>,
  keyword: string,
) => {
  const tokens = tokenizeKeyword(keyword).map(item => item.toLowerCase())
  return rows
    .map((row, index) => ({
      row,
      index,
      score: getMatchScoreForTokens(tokens, getFields(row)),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.row)
}

export const formatMediaDialogueMeta = (input: {
  sourceType: 'TV' | 'MOVIE'
  workTitle: string
  season: string
  episode: string
}) => {
  const title = input.workTitle.trim() || '未命名作品'
  if (input.sourceType === 'TV') {
    const seasonText = input.season.trim() ? `第${input.season.trim()}季` : '未标季'
    const episodeText = input.episode.trim()
      ? `第${input.episode.trim()}集`
      : '未标集'
    return `电视剧 · ${title} · ${seasonText} · ${episodeText}`
  }
  return `电影 · ${title}`
}

export const formatPassageMeta = (item: { collectionTitle?: string | null }) => {
  const paperName = item.collectionTitle?.trim()
  if (paperName) return paperName
  return '文章'
}

export const buildSearchDetailHref = (
  resultId: string,
  type: string,
  q: string,
) => {
  void q
  return `/manage/search/${encodeURIComponent(type)}/${encodeURIComponent(resultId)}`
}

export const extractMaterialSearchText = (contentPayload: unknown) => {
  const payload = asRecord(contentPayload)
  if (!payload) return ''
  return [asString(payload.text), asString(payload.description)]
    .map(item => item.trim())
    .filter(Boolean)
    .join('\n')
}
