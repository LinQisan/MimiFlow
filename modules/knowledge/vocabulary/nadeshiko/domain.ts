import { z } from 'zod'

// Minimal public API schema, checked against the official generated types:
// https://github.com/BrigadaSOS/nadeshiko-sdk-ts/blob/main/generated/public/types.gen.ts
// The README's segmentPublicId example is older than the generated Segment.publicId.
const optionalText = z.string().nullish()
const optionalTime = z.number().finite().nonnegative().nullish()
const segmentSchema = z.object({
  publicId: z.string().trim().min(1).max(128),
  textJa: z.object({ content: z.string().trim().min(1).max(20000) }),
  textEn: z.object({ content: optionalText }).nullish(),
  mediaPublicId: optionalText,
  episode: z.number().int().nonnegative().nullish(),
  startTimeMs: optionalTime,
  endTimeMs: optionalTime,
  urls: z.object({
    audioUrl: optionalText,
    imageUrl: optionalText,
    videoUrl: optionalText,
  }).nullish(),
})
const responseSchema = z.object({
  segments: z.array(segmentSchema).max(20),
  includes: z.object({
    media: z.record(z.string(), z.object({
      publicId: optionalText,
      nameJa: optionalText,
      nameEn: optionalText,
    })).nullish(),
  }).nullish(),
})

export type NadeshikoSegment = z.infer<typeof segmentSchema>
export type NadeshikoSearchResponse = z.infer<typeof responseSchema>
export type NadeshikoExample = {
  externalId: string
  sentence: string
  translation: string | null
  audioUrl: string | null
  imageUrl: string | null
  videoUrl: string | null
  media: { id: string | null; titleJa: string | null; titleEn: string | null }
  episode: number | null
  startTimeMs: number | null
  endTimeMs: number | null
}
export type NadeshikoSearchItem = NadeshikoExample & { isAdded: boolean }
export type NadeshikoSearchState =
  | 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'not-configured' | 'rate-limited'

export const searchInputSchema = z.object({
  vocabularyId: z.string().trim().min(1).max(128),
  query: z.string().trim().min(1).max(200),
}).strict()
export const addInputSchema = searchInputSchema.extend({
  externalId: z.string().trim().min(1).max(128),
  senseId: z.string().trim().min(1).max(128).nullable().optional(),
})

function safeUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function mapNadeshikoResponse(value: unknown): NadeshikoExample[] {
  const response = responseSchema.parse(value)
  const seen = new Set<string>()
  return response.segments.filter(segment => {
    if (seen.has(segment.publicId)) return false
    seen.add(segment.publicId)
    return true
  }).map(segment => {
    const media = segment.mediaPublicId ? response.includes?.media?.[segment.mediaPublicId] : null
    return {
      externalId: segment.publicId,
      sentence: segment.textJa.content,
      translation: segment.textEn?.content?.trim() || null,
      audioUrl: safeUrl(segment.urls?.audioUrl),
      imageUrl: safeUrl(segment.urls?.imageUrl),
      videoUrl: safeUrl(segment.urls?.videoUrl),
      media: {
        id: segment.mediaPublicId || null,
        titleJa: media?.nameJa?.trim() || null,
        titleEn: media?.nameEn?.trim() || null,
      },
      episode: segment.episode ?? null,
      startTimeMs: segment.startTimeMs ?? null,
      endTimeMs: segment.endTimeMs ?? null,
    }
  })
}

export function nadeshikoSourceLabel(example: NadeshikoExample) {
  const seconds = example.startTimeMs === null ? null : Math.floor(example.startTimeMs / 1000)
  return [
    example.media.titleJa || example.media.titleEn,
    example.episode === null ? null : example.episode === 0 ? '电影 / 特别篇' : `第 ${example.episode} 集`,
    seconds === null ? null : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`,
  ].filter(Boolean).join(' · ') || 'Nadeshiko'
}
