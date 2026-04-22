/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv/config')

const { randomUUID } = require('node:crypto')
const { PrismaClient, MaterialType, SourceType } = require('@prisma/client')
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

function normalizeDialogueRows(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((item, index) => {
      const text = asString(item && item.text).trim()
      if (!text) return null
      const start = Math.max(0, asNumber(item && item.start, 0))
      const rawEnd = asNumber(item && item.end, start + 0.5)
      const end = rawEnd > start ? rawEnd : start + 0.5
      return {
        id: index + 1,
        sequenceId: index + 1,
        stableId:
          asString(item && item.stableId).trim() || randomUUID(),
        text,
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
        note: asString(item && item.note).trim(),
        favorite: item && item.favorite === true,
      }
    })
    .filter(Boolean)
}

function stripContextUiChrome(text) {
  let next = (text || '').replace(/\s+/g, ' ').trim()
  if (!next) return next
  const leadingPatterns = [
    /^#\d+\s*/,
    /^(已收藏|收藏)\s*/,
    /^(笔记\*?|笔记)\s*/,
    /^(收起编辑|编辑)\s*/,
    /^(取消|保存笔记)\s*/,
  ]
  let changed = true
  while (changed && next) {
    changed = false
    for (const pattern of leadingPatterns) {
      const replaced = next.replace(pattern, '')
      if (replaced !== next) {
        next = replaced.trim()
        changed = true
      }
    }
  }
  return next
}

function normalizeMatchText(text) {
  return stripContextUiChrome(text)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildMediaSubtitleSourceId(materialId, stableId) {
  const left = (materialId || '').trim()
  const right = (stableId || '').trim()
  return left && right ? `${left}::${right}` : ''
}

function scoreDialogueMatch(rowText, dialogueText) {
  const left = normalizeMatchText(rowText)
  const right = normalizeMatchText(dialogueText)
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right)) return 80
  if (right.includes(left)) return 70
  return 0
}

async function ensureStableIdsForMediaMaterials() {
  const materials = await prisma.material.findMany({
    where: { type: MaterialType.MEDIA_SUBTITLE },
    select: { id: true, contentPayload: true },
  })

  const materialDialogueMap = new Map()

  for (const material of materials) {
    const payload = asRecord(material.contentPayload)
    const normalizedRows = normalizeDialogueRows(payload.dialogues)
    const nextPayload = {
      ...payload,
      dialogues: normalizedRows,
    }

    const originalRows = Array.isArray(payload.dialogues) ? payload.dialogues : []
    const needsUpdate =
      originalRows.length !== normalizedRows.length ||
      originalRows.some((item, index) => {
        const stableId = asString(item && item.stableId).trim()
        return !stableId || asNumber(item && item.id, index + 1) !== index + 1
      })

    if (needsUpdate) {
      await prisma.material.update({
        where: { id: material.id },
        data: { contentPayload: nextPayload },
      })
    }

    materialDialogueMap.set(
      material.id,
      normalizedRows.map(row => ({
        ...row,
        sourceId: buildMediaSubtitleSourceId(material.id, row.stableId),
      })),
    )
  }

  return materialDialogueMap
}

function resolveCandidateForNumericSourceId(sourceId, rowText, materialDialogueMap) {
  const candidates = []
  for (const [materialId, dialogues] of materialDialogueMap.entries()) {
    for (const dialogue of dialogues) {
      if (String(dialogue.id) !== String(sourceId)) continue
      const score = scoreDialogueMatch(rowText, dialogue.text)
      if (score <= 0) continue
      candidates.push({
        materialId,
        stableId: dialogue.stableId,
        nextSourceId: dialogue.sourceId,
        dialogueText: dialogue.text,
        score,
      })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

async function migrateVocabularySentences(materialDialogueMap) {
  const rows = await prisma.vocabularySentence.findMany({
    where: { sourceType: SourceType.AUDIO_DIALOGUE },
    select: { id: true, text: true, sourceId: true },
  })

  const migrated = []

  for (const row of rows) {
    const sourceId = asString(row.sourceId).trim()
    if (!/^\d+$/.test(sourceId)) continue
    const candidate = resolveCandidateForNumericSourceId(
      sourceId,
      row.text,
      materialDialogueMap,
    )
    if (!candidate) continue

    await prisma.vocabularySentence.update({
      where: { id: row.id },
      data: {
        sourceType: SourceType.MEDIA_SUBTITLE_LINE,
        sourceId: candidate.nextSourceId,
      },
    })
    migrated.push({
      id: row.id,
      oldSourceId: sourceId,
      nextSourceId: candidate.nextSourceId,
    })
  }

  return migrated
}

async function migrateVocabularyRoots() {
  const rows = await prisma.vocabulary.findMany({
    where: { sourceType: SourceType.AUDIO_DIALOGUE },
    select: {
      id: true,
      sentenceLinks: {
        select: {
          sentence: {
            select: { sourceType: true, sourceId: true },
          },
        },
      },
    },
  })

  let migrated = 0
  for (const row of rows) {
    const mediaSentence = row.sentenceLinks
      .map(item => item.sentence)
      .find(
        sentence =>
          sentence &&
          sentence.sourceType === SourceType.MEDIA_SUBTITLE_LINE &&
          asString(sentence.sourceId).trim(),
      )
    if (!mediaSentence) continue

    await prisma.vocabulary.update({
      where: { id: row.id },
      data: {
        sourceType: SourceType.MEDIA_SUBTITLE_LINE,
        sourceId: asString(mediaSentence.sourceId).trim(),
      },
    })
    migrated += 1
  }

  return migrated
}

async function migrateSentenceReviews(materialDialogueMap) {
  const rows = await prisma.sentenceReview.findMany({
    where: { sourceType: SourceType.AUDIO_DIALOGUE },
    select: { id: true, text: true, sourceId: true },
  })

  const migrated = []
  for (const row of rows) {
    const sourceId = asString(row.sourceId).trim()
    if (!/^\d+$/.test(sourceId)) continue
    const candidate = resolveCandidateForNumericSourceId(
      sourceId,
      row.text,
      materialDialogueMap,
    )
    if (!candidate) continue

    await prisma.sentenceReview.update({
      where: { id: row.id },
      data: {
        sourceType: SourceType.MEDIA_SUBTITLE_LINE,
        sourceId: candidate.nextSourceId,
      },
    })
    migrated.push({ id: row.id, nextSourceId: candidate.nextSourceId })
  }
  return migrated
}

async function migrateReviewEvents(sentenceReviewMigrations) {
  if (sentenceReviewMigrations.length === 0) return 0
  const migratedReviewIds = new Map(
    sentenceReviewMigrations.map(item => [item.id, item.nextSourceId]),
  )

  const rows = await prisma.reviewEvent.findMany({
    where: {
      sourceType: SourceType.AUDIO_DIALOGUE,
      reviewId: { in: Array.from(migratedReviewIds.keys()) },
    },
    select: { id: true, reviewId: true },
  })

  for (const row of rows) {
    const nextSourceId = migratedReviewIds.get(row.reviewId)
    if (!nextSourceId) continue
    await prisma.reviewEvent.update({
      where: { id: row.id },
      data: {
        sourceType: SourceType.MEDIA_SUBTITLE_LINE,
        sourceId: nextSourceId,
      },
    })
  }

  return rows.length
}

async function main() {
  const materialDialogueMap = await ensureStableIdsForMediaMaterials()
  const migratedSentences = await migrateVocabularySentences(materialDialogueMap)
  const migratedVocabularies = await migrateVocabularyRoots()
  const migratedSentenceReviews = await migrateSentenceReviews(materialDialogueMap)
  const migratedReviewEvents = await migrateReviewEvents(migratedSentenceReviews)

  console.log(
    JSON.stringify(
      {
        mediaMaterials: materialDialogueMap.size,
        migratedVocabularySentences: migratedSentences.length,
        migratedVocabularies,
        migratedSentenceReviews: migratedSentenceReviews.length,
        migratedReviewEvents,
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
