import { MaterialType } from '#prisma-client'
import { readString } from '@/lib/validation/schema'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'

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
  const id = resultId.replace(/^(vocab|sentence|passage|quiz|question)-/, '')
  if (type === 'passage') return `/manage/reading/${encodeURIComponent(id)}`
  if (type === 'quiz') return `/manage/questions/${encodeURIComponent(id)}`
  if (type === 'vocabulary' || type === 'sentence') {
    return `/manage/vocabulary?q=${encodeURIComponent(q)}`
  }
  if (type === 'dialogue') return `/manage/shadowing?q=${encodeURIComponent(q)}`
  return '/manage/practice'
}

export const extractMaterialSearchText = (
  type: MaterialType,
  contentPayload: unknown,
) => {
  const payload = decodeMaterialPayloadRecord(type, contentPayload)
  return [readString(payload.text), readString(payload.description)]
    .map(item => item.trim())
    .filter(Boolean)
    .join('\n')
}
