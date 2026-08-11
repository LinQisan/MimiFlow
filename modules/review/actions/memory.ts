'use server'

// Shared FSRS actions for vocabulary and sentence memory reviews.
import { MaterialType, Prisma } from '#prisma-client'
import {
  Rating,
  checkParameters,
  createEmptyCard,
  default_w,
  fsrs,
} from 'ts-fsrs'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { readFiniteNumber, readString } from '@/lib/validation/schema'
import { decodeMaterialPayload } from '@/lib/codecs/material-payload'
import {
  toFsrsCard,
  toStoredFsrsUpdate,
} from '@/modules/review/domain/fsrs-card'

const PROFILE_ID = 'default'
const DAY_MS = 24 * 60 * 60 * 1000
const FIT_INTERVAL_MS = 12 * 60 * 60 * 1000
const FIT_LOOKBACK_DAYS = 180
const FIT_MIN_EVENTS = 60
const FIT_MIN_NEW_EVENTS = 24

type FsrsParamSet = {
  request_retention: number
  maximum_interval: number
  w: number[]
}

type ReviewFitEvent = {
  rating: number
  deltaDays: number
  scheduledDays: number
  wasOverdue: boolean
  wasRecallSuccess: boolean
  stabilityBefore: number
  stabilityAfter: number
  difficultyBefore: number
  difficultyAfter: number
}

type DialogueSnapshot = {
  id: number
  text: string
  start: number
  end: number
  lesson: {
    id: string
    title: string
    audioFile: string
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

async function getListeningDialoguesByIds(targetIds: number[]) {
  const normalizedIds = Array.from(
    new Set(targetIds.map(id => Number(id)).filter(Number.isFinite)),
  )
  if (normalizedIds.length === 0) return []

  const materials = await prisma.material.findMany({
    where: { type: MaterialType.LISTENING },
    select: {
      id: true,
      title: true,
      contentPayload: true,
    },
  })

  const idSet = new Set(normalizedIds)
  const snapshots: DialogueSnapshot[] = []
  for (const material of materials) {
    const payload = decodeMaterialPayload(MaterialType.LISTENING, material.contentPayload)
    const rawDialogues = Array.isArray(payload.dialogues)
      ? (payload.dialogues as Record<string, unknown>[])
      : []
    const audioFile = readString(payload.audioFile) || readString(payload.audioUrl)

    for (const row of rawDialogues) {
      const dialogueId = readFiniteNumber(row.id, readFiniteNumber(row.sequenceId))
      if (!idSet.has(dialogueId)) continue
      snapshots.push({
        id: dialogueId,
        text: readString(row.text),
        start: readFiniteNumber(row.start),
        end: readFiniteNumber(row.end),
        lesson: {
          id: material.id,
          title: material.title,
          audioFile,
        },
      })
    }
  }

  return snapshots
}

const parseWeights = (raw: string): number[] | null => {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const nums = parsed.map(item => Number(item)).filter(item => Number.isFinite(item))
    if (nums.length !== default_w.length) return null
    return nums
  } catch {
    return null
  }
}

const defaultParamSet = (): FsrsParamSet => ({
  request_retention: 0.9,
  maximum_interval: 36500,
  w: [...default_w],
})

const ensureLearnerProfile = async () =>
  prisma.learnerProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID },
    update: {},
  })

const ensureFsrsProfile = async () => {
  await ensureLearnerProfile()
  return prisma.fSRSProfile.upsert({
    where: { profileId: PROFILE_ID },
    create: {
      profileId: PROFILE_ID,
      requestRetention: 0.9,
      maximumInterval: 36500,
      weights: JSON.stringify([...default_w]),
      fitVersion: 1,
      enabled: true,
    },
    update: {},
  })
}

const toEngineParams = (profile: {
  requestRetention: number
  maximumInterval: number
  weights: string
  enabled: boolean
}): FsrsParamSet | null => {
  if (!profile.enabled) return null
  const parsedWeights = parseWeights(profile.weights)
  if (!parsedWeights) return null

  try {
    const checkedWeights = checkParameters(parsedWeights)
    return {
      request_retention: clamp(profile.requestRetention, 0.8, 0.97),
      maximum_interval: Math.round(clamp(profile.maximumInterval, 30, 36500)),
      w: [...checkedWeights] as number[],
    }
  } catch {
    return null
  }
}

const buildEngine = (params: FsrsParamSet | null) => {
  if (!params) return fsrs()
  try {
    return fsrs(params)
  } catch {
    return fsrs()
  }
}

const fitParamsFromEvents = (events: ReviewFitEvent[]): FsrsParamSet | null => {
  if (events.length < FIT_MIN_EVENTS) return null

  const total = events.length
  const againCount = events.filter(item => item.rating === Rating.Again).length
  const hardCount = events.filter(item => item.rating === Rating.Hard).length
  const easyCount = events.filter(item => item.rating === Rating.Easy).length
  const successCount = events.filter(item => item.wasRecallSuccess).length
  const onTimeCount = events.filter(item => !item.wasOverdue).length

  const againRate = againCount / total
  const hardRate = hardCount / total
  const easyRate = easyCount / total
  const successRate = successCount / total
  const onTimeRate = onTimeCount / total

  const overdueSeverity =
    events.reduce((sum, item) => {
      const overflow = Math.max(0, item.deltaDays - item.scheduledDays)
      return sum + overflow / Math.max(1, item.scheduledDays)
    }, 0) / total

  const stabilityGain =
    events.reduce((sum, item) => {
      return sum + (item.stabilityAfter - item.stabilityBefore) / Math.max(0.1, item.stabilityBefore)
    }, 0) / total

  const difficultyShift =
    events.reduce((sum, item) => sum + (item.difficultyAfter - item.difficultyBefore), 0) /
    total

  const strengthScore = clamp(
    0.55 * successRate +
      0.2 * onTimeRate +
      0.12 * (1 - againRate) +
      0.08 * easyRate +
      0.05 * Math.max(0, stabilityGain),
    0,
    1,
  )

  const requestRetention = clamp(
    0.94 - (strengthScore - 0.5) * 0.08 + overdueSeverity * 0.035,
    0.84,
    0.95,
  )

  const maximumInterval = Math.round(
    clamp(36500 * (0.55 + strengthScore * 0.55), 120, 36500),
  )

  const tuned = [...default_w]

  const initStabilityScale = clamp(0.92 + strengthScore * 0.2, 0.9, 1.12)
  tuned[0] *= initStabilityScale
  tuned[1] *= initStabilityScale
  tuned[2] *= initStabilityScale
  tuned[3] *= initStabilityScale

  const growthScale = clamp(0.95 + strengthScore * 0.15 - overdueSeverity * 0.05, 0.9, 1.1)
  tuned[8] *= growthScale
  tuned[9] *= growthScale

  const difficultyScale = clamp(
    1.07 - strengthScore * 0.14 - difficultyShift * 0.01 + hardRate * 0.02,
    0.9,
    1.1,
  )
  tuned[4] *= difficultyScale

  try {
    const checkedWeights = checkParameters(tuned)
    return {
      request_retention: requestRetention,
      maximum_interval: maximumInterval,
      w: [...checkedWeights] as number[],
    }
  } catch {
    return {
      ...defaultParamSet(),
      request_retention: requestRetention,
      maximum_interval: maximumInterval,
    }
  }
}

const maybeRefitFsrsProfile = async () => {
  const profile = await ensureFsrsProfile()
  const now = new Date()

  const lastFittedAt = profile.lastFittedAt
  const isStale = !lastFittedAt || now.getTime() - lastFittedAt.getTime() >= FIT_INTERVAL_MS
  if (!isStale) return profile

  const lookbackStart = new Date(now.getTime() - FIT_LOOKBACK_DAYS * DAY_MS)

  const totalInWindow = await prisma.reviewEvent.count({
    where: {
      profileId: PROFILE_ID,
      reviewedAt: { gte: lookbackStart },
    },
  })

  if (totalInWindow < FIT_MIN_EVENTS) return profile

  if (lastFittedAt) {
    const newEvents = await prisma.reviewEvent.count({
      where: {
        profileId: PROFILE_ID,
        reviewedAt: { gt: lastFittedAt },
      },
    })
    if (newEvents < FIT_MIN_NEW_EVENTS) return profile
  }

  const events = await prisma.reviewEvent.findMany({
    where: {
      profileId: PROFILE_ID,
      reviewedAt: { gte: lookbackStart },
    },
    orderBy: { reviewedAt: 'desc' },
    take: 1200,
    select: {
      rating: true,
      deltaDays: true,
      scheduledDays: true,
      wasOverdue: true,
      wasRecallSuccess: true,
      stabilityBefore: true,
      stabilityAfter: true,
      difficultyBefore: true,
      difficultyAfter: true,
    },
  })

  const fitted = fitParamsFromEvents(events)
  if (!fitted) return profile

  await prisma.fSRSProfile.update({
    where: { profileId: PROFILE_ID },
    data: {
      requestRetention: fitted.request_retention,
      maximumInterval: fitted.maximum_interval,
      weights: JSON.stringify(fitted.w),
      sampleSize: events.length,
      lastFittedAt: now,
      enabled: true,
      fitVersion: profile.fitVersion + 1,
    },
  })

  return prisma.fSRSProfile.findUnique({ where: { profileId: PROFILE_ID } })
}

const getEngineWithAutoFit = async () => {
  const profile = await maybeRefitFsrsProfile()
  const finalProfile = profile || (await ensureFsrsProfile())
  const custom = toEngineParams(finalProfile)
  const now = new Date()

  if (!custom) {
    await prisma.fSRSProfile.update({
      where: { profileId: PROFILE_ID },
      data: {
        lastEngineMode: 'fallback',
        lastFallbackReason: 'invalid_or_disabled_profile_params',
        lastFallbackAt: now,
      },
    })
    return {
      engine: buildEngine(null),
      profile: {
        ...finalProfile,
        lastEngineMode: 'fallback',
        lastFallbackReason: 'invalid_or_disabled_profile_params',
        lastFallbackAt: now,
      },
      usingFallback: true,
    }
  }

  if (finalProfile.lastEngineMode !== 'custom') {
    await prisma.fSRSProfile.update({
      where: { profileId: PROFILE_ID },
      data: {
        lastEngineMode: 'custom',
      },
    })
  }

  return {
    engine: buildEngine(custom),
    profile: finalProfile,
    usingFallback: false,
  }
}

export async function rateSentenceFluency(reviewId: string, rating: Rating) {
  try {
    const record = await prisma.sentenceReview.findUnique({
      where: { id: reviewId },
    })
    if (!record) throw new Error('找不到复习记录')

    const { engine, usingFallback } = await getEngineWithAutoFit()

    const currentCard = toFsrsCard(record)

    const now = new Date()
    const schedulingCards = engine.repeat(currentCard, now)
    const validRating = rating as 1 | 2 | 3 | 4
    const nextCard = schedulingCards[validRating].card

    const deltaDays = record.last_review
      ? Math.max(0, Math.round((now.getTime() - record.last_review.getTime()) / DAY_MS))
      : 0
    const wasOverdue = now.getTime() > record.due.getTime()
    const wasRecallSuccess = rating >= Rating.Hard

    await prisma.$transaction(async tx => {
      await tx.sentenceReview.update({
        where: { id: reviewId },
        data: toStoredFsrsUpdate(nextCard),
      })

      await tx.reviewEvent.create({
        data: {
          profileId: PROFILE_ID,
          reviewId,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          rating,
          deltaDays,
          scheduledDays: Math.max(0, record.scheduled_days),
          stateBefore: record.state,
          stateAfter: nextCard.state,
          stabilityBefore: record.stability,
          stabilityAfter: nextCard.stability,
          difficultyBefore: record.difficulty,
          difficultyAfter: nextCard.difficulty,
          dueAt: record.due,
          reviewedAt: now,
          wasOverdue,
          wasRecallSuccess,
        },
      })

      await tx.fSRSProfile.update({
        where: { profileId: PROFILE_ID },
        data: { lastEventAt: now },
      })
    })

    revalidatePath('/review')
    revalidatePath('/review/memory')
    revalidatePath('/')

    return { success: true, usingFallback }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '评分失败'
    return { success: false, message }
  }
}

export async function addSentenceToReview(dialogueId: number) {
  try {
    const dialogue = (await getListeningDialoguesByIds([dialogueId]))[0]

    if (!dialogue) {
      return { success: false, message: '找不到对应的听力句子' }
    }

    const emptyCard = createEmptyCard()

    await prisma.sentenceReview.create({
      data: {
        sourceId: String(dialogueId),
        text: dialogue.text,
        sourceType: 'AUDIO_DIALOGUE',
        due: emptyCard.due,
        state: emptyCard.state,
        stability: emptyCard.stability,
        difficulty: emptyCard.difficulty,
        elapsed_days: emptyCard.elapsed_days,
        scheduled_days: emptyCard.scheduled_days,
        reps: emptyCard.reps,
        lapses: emptyCard.lapses,
        learning_steps: 0,
      },
    })

    revalidatePath('/review')
    revalidatePath('/review/memory')
    revalidatePath('/')

    return { success: true, message: '已加入跟读复习库' }
  } catch (error: unknown) {
    console.error('添加句子到复习库失败:', error)

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        success: false,
        state: 'already_exists',
        message: '已在复习库中',
      }
    }

    const message = error instanceof Error ? error.message : '加入复习库失败'
    return { success: false, message }
  }
}

const ensureVocabularyReviewCard = async (vocabularyId: string) => {
  const existing = await prisma.vocabularyReview.findUnique({
    where: { vocabularyId },
  })
  if (existing) return existing

  const vocabulary = await prisma.vocabulary.findUnique({
    where: { id: vocabularyId },
    select: { id: true },
  })
  if (!vocabulary) throw new Error('找不到单词记录')

  const emptyCard = createEmptyCard()
  return prisma.vocabularyReview.create({
    data: {
      vocabularyId,
      due: emptyCard.due,
      state: emptyCard.state,
      stability: emptyCard.stability,
      difficulty: emptyCard.difficulty,
      elapsed_days: emptyCard.elapsed_days,
      scheduled_days: emptyCard.scheduled_days,
      reps: emptyCard.reps,
      lapses: emptyCard.lapses,
      learning_steps: 0,
      last_review: emptyCard.last_review || null,
    },
  })
}

export async function rateVocabularyMemory(vocabularyId: string, rating: Rating) {
  try {
    const vocabulary = await prisma.vocabulary.findUnique({
      where: { id: vocabularyId },
      select: { id: true, sourceType: true },
    })
    if (!vocabulary) throw new Error('找不到单词记录')

    const record = await ensureVocabularyReviewCard(vocabularyId)
    const { engine, usingFallback } = await getEngineWithAutoFit()
    const now = new Date()

    const currentCard = toFsrsCard(record)
    const schedulingCards = engine.repeat(currentCard, now)
    const validRating = rating as 1 | 2 | 3 | 4
    const nextCard = schedulingCards[validRating].card

    const deltaDays = record.last_review
      ? Math.max(0, Math.round((now.getTime() - record.last_review.getTime()) / DAY_MS))
      : 0
    const wasOverdue = now.getTime() > record.due.getTime()
    const wasRecallSuccess = rating >= Rating.Hard

    await prisma.$transaction(async tx => {
      await tx.vocabularyReview.update({
        where: { id: record.id },
        data: toStoredFsrsUpdate(nextCard),
      })

      await tx.reviewEvent.create({
        data: {
          profileId: PROFILE_ID,
          reviewId: record.id,
          sourceType: vocabulary.sourceType,
          sourceId: vocabulary.id,
          rating,
          deltaDays,
          scheduledDays: Math.max(0, record.scheduled_days),
          stateBefore: record.state,
          stateAfter: nextCard.state,
          stabilityBefore: record.stability,
          stabilityAfter: nextCard.stability,
          difficultyBefore: record.difficulty,
          difficultyAfter: nextCard.difficulty,
          dueAt: record.due,
          reviewedAt: now,
          wasOverdue,
          wasRecallSuccess,
        },
      })

      await tx.fSRSProfile.update({
        where: { profileId: PROFILE_ID },
        data: { lastEventAt: now },
      })
    })

    revalidatePath('/vocabulary')
    revalidatePath('/review/memory')
    revalidatePath('/')

    return {
      success: true,
      usingFallback,
      review: {
        due: nextCard.due,
        state: nextCard.state,
        stability: nextCard.stability,
        difficulty: nextCard.difficulty,
        elapsed_days: nextCard.elapsed_days,
        scheduled_days: nextCard.scheduled_days,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
        learning_steps: toStoredFsrsUpdate(nextCard).learning_steps,
        last_review: nextCard.last_review || null,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '评分失败'
    return { success: false, message }
  }
}

async function getFsrsProfileSnapshot() {
  const profile = await ensureFsrsProfile()
  const parsedWeights = parseWeights(profile.weights) || [...default_w]
  return {
    requestRetention: profile.requestRetention,
    maximumInterval: profile.maximumInterval,
    weights: parsedWeights,
    sampleSize: profile.sampleSize,
    fitVersion: profile.fitVersion,
    enabled: profile.enabled,
    lastEngineMode: profile.lastEngineMode,
    lastFallbackReason: profile.lastFallbackReason,
    lastFallbackAt: profile.lastFallbackAt,
    lastFittedAt: profile.lastFittedAt,
    lastEventAt: profile.lastEventAt,
  }
}

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function getFsrsAdminDashboard() {
  const profile = await getFsrsProfileSnapshot()
  const now = new Date()
  const recent = await prisma.reviewEvent.findMany({
    where: { profileId: PROFILE_ID },
    orderBy: { reviewedAt: 'desc' },
    take: 500,
    select: {
      rating: true,
      reviewedAt: true,
      wasOverdue: true,
      wasRecallSuccess: true,
    },
  })

  const in7d = recent.filter(item => now.getTime() - item.reviewedAt.getTime() <= 7 * DAY_MS)
  const in30d = recent.filter(
    item => now.getTime() - item.reviewedAt.getTime() <= 30 * DAY_MS,
  )

  const successRate7d = in7d.length
    ? Math.round((in7d.filter(item => item.wasRecallSuccess).length / in7d.length) * 100)
    : 0
  const overdueRate7d = in7d.length
    ? Math.round((in7d.filter(item => item.wasOverdue).length / in7d.length) * 100)
    : 0

  const ratingDist = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(rating => ({
    rating,
    count: in30d.filter(item => item.rating === rating).length,
  }))

  const trendMap = new Map<string, { dateKey: string; total: number; success: number }>()
  in30d.forEach(item => {
    const dateKey = toDateKey(item.reviewedAt)
    const bucket = trendMap.get(dateKey) || { dateKey, total: 0, success: 0 }
    bucket.total += 1
    if (item.wasRecallSuccess) bucket.success += 1
    trendMap.set(dateKey, bucket)
  })

  const trend = Array.from(trendMap.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-14)
    .map(item => ({
      ...item,
      successRate: item.total ? Math.round((item.success / item.total) * 100) : 0,
    }))

  return {
    profile,
    stats: {
      eventCount7d: in7d.length,
      eventCount30d: in30d.length,
      successRate7d,
      overdueRate7d,
      usingFallback: profile.lastEngineMode !== 'custom',
    },
    ratingDist,
    trend,
  }
}
