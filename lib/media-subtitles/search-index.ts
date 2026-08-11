import { Prisma, PrismaClient } from '#prisma-client'
import {
  readFiniteNumber,
  readJsonRecord,
  readString,
} from '@/lib/validation/schema'
import { decodeMaterialPayload } from '@/lib/codecs/material-payload'

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

function buildMediaSubtitleSearchIndexRows(
  material: MediaSubtitleMaterialSnapshot,
) {
  const payload = decodeMaterialPayload('MEDIA_SUBTITLE', material.contentPayload)
  const rawDialogues = Array.isArray(payload.dialogues)
    ? payload.dialogues
    : []
  const materialTitle = material.title.trim()
  const workTitle = readString(payload.subtitleWorkTitle).trim()
  const season = readString(payload.subtitleSeason).trim()
  const episode = readString(payload.subtitleEpisode).trim()
  const subtitleSourceType =
    readString(payload.subtitleSourceType).trim() === 'TV' ? 'TV' : 'MOVIE'
  const subtitleTypeLabel = subtitleSourceType === 'TV' ? '电视剧' : '电影'

  return rawDialogues
    .map((rawDialogue, index) => {
      const dialogue = readJsonRecord(rawDialogue)
      const text = readString(dialogue.text).trim()
      const stableId = readString(dialogue.stableId).trim()
      if (!text || !stableId) return null

      const note = readString(dialogue.note).trim()
      const sequenceId = Math.max(
        1,
        readFiniteNumber(dialogue.id, index + 1),
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
        start: Number(readFiniteNumber(dialogue.start, 0).toFixed(2)),
        end: Number(readFiniteNumber(dialogue.end, 0).toFixed(2)),
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
