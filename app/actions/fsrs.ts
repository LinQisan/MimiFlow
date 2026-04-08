'use server'

import { MaterialType } from '@prisma/client'
import {
  Card,
  Rating,
  State,
  checkParameters,
  createEmptyCard,
  default_w,
  fsrs,
} from 'ts-fsrs'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown, fallback = 0) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

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
    const payload = asRecord(material.contentPayload)
    const rawDialogues = Array.isArray(payload.dialogues)
      ? (payload.dialogues as Record<string, unknown>[])
      : []
    const audioFile = asString(payload.audioFile) || asString(payload.audioUrl)

    for (const row of rawDialogues) {
      const dialogueId = asNumber(row.id, asNumber(row.sequenceId))
      if (!idSet.has(dialogueId)) continue
      snapshots.push({
        id: dialogueId,
        text: asString(row.text),
        start: asNumber(row.start),
        end: asNumber(row.end),
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

async function getListeningDialogueContextByIds(targetIds: number[]) {
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
  const snapshots: Array<
    DialogueSnapshot & {
      lesson: DialogueSnapshot['lesson'] & {
        dialogues: Array<{
          id: number
          text: string
          start: number
          end: number
        }>
      }
    }
  > = []

  for (const material of materials) {
    const payload = asRecord(material.contentPayload)
    const rawDialogues = Array.isArray(payload.dialogues)
      ? (payload.dialogues as Record<string, unknown>[])
      : []
    const dialogues = rawDialogues.map((row, index) => ({
      id: asNumber(row.id, index + 1),
      text: asString(row.text),
      start: asNumber(row.start),
      end: asNumber(row.end),
    }))
    const audioFile = asString(payload.audioFile) || asString(payload.audioUrl)

    for (const row of dialogues) {
      if (!idSet.has(row.id)) continue
      snapshots.push({
        ...row,
        lesson: {
          id: material.id,
          title: material.title,
          audioFile,
          dialogues,
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

const ensureGameProfile = async () =>
  prisma.gameProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID },
    update: {},
  })

const ensureFsrsProfile = async () => {
  await ensureGameProfile()
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

export async function getDueSentences() {
  const now = new Date()

  try {
    const reviews = await prisma.sentenceReview.findMany({
      where: { due: { lte: now } },
      orderBy: { due: 'asc' },
    })

    if (reviews.length === 0) return []

    const dialogueIds = reviews
      .filter(r => r.sourceType === 'AUDIO_DIALOGUE')
      .map(r => Number(r.sourceId))

    const dialoguesWithContext = await getListeningDialogueContextByIds(dialogueIds)

    return reviews.map(review => {
      if (review.sourceType === 'AUDIO_DIALOGUE') {
        const currentDialogue = dialoguesWithContext.find(
          d => d.id === Number(review.sourceId),
        )

        if (!currentDialogue) return review

        const allDialogues = currentDialogue.lesson.dialogues
        const currentIndex = allDialogues.findIndex(d => d.id === currentDialogue.id)

        const prevDialogue = currentIndex > 0 ? allDialogues[currentIndex - 1] : null
        const nextDialogue =
          currentIndex < allDialogues.length - 1 ? allDialogues[currentIndex + 1] : null

        return {
          ...review,
          dialogue: currentDialogue,
          context: {
            prev: prevDialogue?.text || null,
            next: nextDialogue?.text || null,
            playStart: prevDialogue ? prevDialogue.start : currentDialogue.start,
            playEnd: nextDialogue ? nextDialogue.end : currentDialogue.end,
          },
        }
      }

      return review
    })
  } catch (error) {
    console.error('获取复习句子失败:', error)
    return []
  }
}

export async function rateSentenceFluency(reviewId: string, rating: Rating) {
  try {
    const record = await prisma.sentenceReview.findUnique({
      where: { id: reviewId },
    })
    if (!record) throw new Error('找不到复习记录')

    const { engine, usingFallback } = await getEngineWithAutoFit()

    const currentCard: Card = {
      ...createEmptyCard(),
      due: record.due,
      state: record.state as State,
      stability: record.stability,
      difficulty: record.difficulty,
      elapsed_days: record.elapsed_days,
      scheduled_days: record.scheduled_days,
      reps: record.reps,
      lapses: record.lapses,
      last_review: record.last_review || undefined,
    }

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
        data: {
          due: nextCard.due,
          state: nextCard.state,
          stability: nextCard.stability,
          difficulty: nextCard.difficulty,
          elapsed_days: nextCard.elapsed_days,
          scheduled_days: nextCard.scheduled_days,
          reps: nextCard.reps,
          lapses: nextCard.lapses,
          learning_steps: (nextCard as { learning_steps?: number }).learning_steps ?? 0,
          last_review: nextCard.last_review || null,
        },
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

    revalidatePath('/sentences')
    revalidatePath('/review')
    revalidatePath('/')

    return { success: true, message: '已加入跟读复习库' }
  } catch (error: any) {
    console.error('添加句子到复习库失败:', error)

    if (error.code === 'P2002') {
      return {
        success: false,
        state: 'already_exists',
        message: '已在复习库中',
      }
    }

    return { success: false, message: error.message }
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

    const currentCard: Card = {
      ...createEmptyCard(),
      due: record.due,
      state: record.state as State,
      stability: record.stability,
      difficulty: record.difficulty,
      elapsed_days: record.elapsed_days,
      scheduled_days: record.scheduled_days,
      reps: record.reps,
      lapses: record.lapses,
      last_review: record.last_review || undefined,
    }
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
        data: {
          due: nextCard.due,
          state: nextCard.state,
          stability: nextCard.stability,
          difficulty: nextCard.difficulty,
          elapsed_days: nextCard.elapsed_days,
          scheduled_days: nextCard.scheduled_days,
          reps: nextCard.reps,
          lapses: nextCard.lapses,
          learning_steps: (nextCard as { learning_steps?: number }).learning_steps ?? 0,
          last_review: nextCard.last_review || null,
        },
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
        learning_steps: (nextCard as { learning_steps?: number }).learning_steps ?? 0,
        last_review: nextCard.last_review || null,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '评分失败'
    return { success: false, message }
  }
}

export async function removeSentenceFromReview(reviewId: string) {
  try {
    await prisma.sentenceReview.delete({ where: { id: reviewId } })

    revalidatePath('/sentences')
    revalidatePath('/review')
    revalidatePath('/')

    return { success: true }
  } catch {
    return { success: false, message: '移除失败' }
  }
}

export async function getAllReviewSentences() {
  const reviews = await prisma.sentenceReview.findMany({
    orderBy: { id: 'desc' },
  })

  const dialogueIds = reviews
    .filter(r => r.sourceType === 'AUDIO_DIALOGUE')
    .map(r => Number(r.sourceId))

  if (dialogueIds.length === 0) return reviews

  const dialogues = await getListeningDialoguesByIds(dialogueIds)

  return reviews.map(review => {
    if (review.sourceType === 'AUDIO_DIALOGUE') {
      const matchingDialogue = dialogues.find(d => d.id === Number(review.sourceId))
      return {
        ...review,
        dialogue: matchingDialogue,
      }
    }
    return review
  })
}

export async function getReviewSentencesPage(page = 1, pageSize = 30) {
  const safePageSize = Math.min(100, Math.max(10, Math.floor(pageSize)))
  const rawPage = Math.max(1, Math.floor(page))
  const total = await prisma.sentenceReview.count()
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const normalizedPage = Math.min(rawPage, totalPages)
  const skip = (normalizedPage - 1) * safePageSize

  const reviews = await prisma.sentenceReview.findMany({
    orderBy: { id: 'desc' },
    skip,
    take: safePageSize,
  })

  const dialogueIds = reviews
    .filter(r => r.sourceType === 'AUDIO_DIALOGUE')
    .map(r => Number(r.sourceId))

  const dialogues =
    dialogueIds.length === 0
      ? []
      : await getListeningDialoguesByIds(dialogueIds)

  const items = reviews.map(review => {
    if (review.sourceType === 'AUDIO_DIALOGUE') {
      const matchingDialogue = dialogues.find(d => d.id === Number(review.sourceId))
      return {
        ...review,
        dialogue: matchingDialogue,
      }
    }
    return review
  })

  return {
    items,
    total,
    page: normalizedPage,
    pageSize: safePageSize,
    totalPages,
  }
}

export async function getFsrsProfileSnapshot() {
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
