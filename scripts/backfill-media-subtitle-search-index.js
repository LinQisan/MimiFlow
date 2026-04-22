/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv/config')

const { PrismaClient, MaterialType } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asString(value) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildRows(material) {
  const payload = asRecord(material.contentPayload)
  const rawDialogues = Array.isArray(payload.dialogues) ? payload.dialogues : []
  const materialTitle = asString(material.title).trim()
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
      return {
        materialId: material.id,
        stableId,
        sequenceId: Math.max(1, asNumber(dialogue.id, index + 1)),
        text,
        normalizedText: normalizeSearchText(text),
        searchText: normalizeSearchText(
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
            .filter(Boolean)
            .join(' '),
        ),
        note: note || null,
        start: Number(asNumber(dialogue.start, 0).toFixed(2)),
        end: Number(asNumber(dialogue.end, 0).toFixed(2)),
        materialTitle,
        workTitle: workTitle || null,
        season: season || null,
        episode: episode || null,
        subtitleSourceType,
      }
    })
    .filter(Boolean)
}

async function main() {
  const materials = await prisma.material.findMany({
    where: { type: MaterialType.MEDIA_SUBTITLE },
    select: {
      id: true,
      title: true,
      contentPayload: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  let totalRows = 0

  for (const material of materials) {
    const rows = buildRows(material)
    totalRows += rows.length

    await prisma.$transaction(async tx => {
      await tx.mediaSubtitleLine.deleteMany({
        where: { materialId: material.id },
      })
      if (rows.length > 0) {
        await tx.mediaSubtitleLine.createMany({ data: rows })
      }
    })
  }

  console.log(
    JSON.stringify(
      {
        mediaMaterials: materials.length,
        indexedRows: totalRows,
      },
      null,
      2,
    ),
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
