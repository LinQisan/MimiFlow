import { Prisma, PrismaClient } from '@prisma/client'
import {
  asFiniteNumber,
  asRecord,
  asString,
  type UnknownRecord,
} from '@/utils/validation/unknown'

type MediaSubtitleMaterialSnapshot = {
  id: string
  title: string
  contentPayload: unknown
}

type MediaSubtitleSearchIndexClient = PrismaClient | Prisma.TransactionClient

export function normalizeMediaSubtitleSearchText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildMediaSubtitleSearchIndexRows(
  material: MediaSubtitleMaterialSnapshot,
) {
  const payload = asRecord(material.contentPayload)
  const rawDialogues = Array.isArray(payload.dialogues)
    ? (payload.dialogues as UnknownRecord[])
    : []
  const materialTitle = material.title.trim()
  const workTitle = asString(payload.subtitleWorkTitle).trim()
  const season = asString(payload.subtitleSeason).trim()
  const episode = asString(payload.subtitleEpisode).trim()
  const subtitleSourceType =
    asString(payload.subtitleSourceType).trim() === 'TV' ? 'TV' : 'MOVIE'
  const subtitleTypeLabel = subtitleSourceType === 'TV' ? '电视剧' : '电影'

  return rawDialogues
    .map((rawDialogue, index) => {
      const dialogue = asRecord(rawDialogue)
      const text = asString(dialogue.text).trim()
      const stableId = asString(dialogue.stableId).trim()
      if (!text || !stableId) return null

      const note = asString(dialogue.note).trim()
      const sequenceId = Math.max(
        1,
        asFiniteNumber(dialogue.id, index + 1),
      )
      const searchText = normalizeMediaSubtitleSearchText(
        [
          text,
          note,
          materialTitle,
          workTitle,
          season,
          episode,
          subtitleTypeLabel,
          subtitleSourceType,
        ]
          .map(item => item.trim())
          .filter(Boolean)
          .join(' '),
      )

      return {
        materialId: material.id,
        stableId,
        sequenceId,
        text,
        normalizedText: normalizeMediaSubtitleSearchText(text),
        searchText,
        note: note || null,
        start: Number(asFiniteNumber(dialogue.start, 0).toFixed(2)),
        end: Number(asFiniteNumber(dialogue.end, 0).toFixed(2)),
        materialTitle,
        workTitle: workTitle || null,
        season: season || null,
        episode: episode || null,
        subtitleSourceType,
      }
    })
    .filter(Boolean) as Array<{
    materialId: string
    stableId: string
    sequenceId: number
    text: string
    normalizedText: string
    searchText: string
    note: string | null
    start: number
    end: number
    materialTitle: string
    workTitle: string | null
    season: string | null
    episode: string | null
    subtitleSourceType: string
  }>
}

export async function replaceMediaSubtitleSearchIndex(
  db: MediaSubtitleSearchIndexClient,
  material: MediaSubtitleMaterialSnapshot,
) {
  const rows = buildMediaSubtitleSearchIndexRows(material)

  await db.mediaSubtitleLine.deleteMany({
    where: { materialId: material.id },
  })

  if (rows.length === 0) return 0

  await db.mediaSubtitleLine.createMany({
    data: rows,
  })

  return rows.length
}
