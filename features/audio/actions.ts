'use server'
import prisma from '@/lib/prisma'

const PROFILE_ID = 'default'

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function logMaterialPlaytime(materialId: string, seconds: number) {
  try {
    const normalizedMaterialId = (materialId || '').trim()
    if (!normalizedMaterialId) return { success: false, message: 'materialId 缺失' }

    const safeSeconds = Math.max(0, Math.min(180, Math.round(seconds)))
    if (safeSeconds <= 0) return { success: true, totalSeconds: 0 }

    const now = new Date()
    const todayKey = toDateKey(now)
    const previous = await prisma.materialPlaytimeStat.findUnique({
      where: {
        profileId_materialId: {
          profileId: PROFILE_ID,
          materialId: normalizedMaterialId,
        },
      },
      select: { lastPlayedAt: true },
    })

    const shouldIncreasePlayedDays =
      !previous?.lastPlayedAt || toDateKey(previous.lastPlayedAt) !== todayKey

    const stat = await prisma.materialPlaytimeStat.upsert({
      where: {
        profileId_materialId: {
          profileId: PROFILE_ID,
          materialId: normalizedMaterialId,
        },
      },
      create: {
        profileId: PROFILE_ID,
        materialId: normalizedMaterialId,
        totalSeconds: safeSeconds,
        playedDays: 1,
        lastPlayedAt: now,
      },
      update: {
        totalSeconds: { increment: safeSeconds },
        lastPlayedAt: now,
        ...(shouldIncreasePlayedDays ? { playedDays: { increment: 1 } } : {}),
      },
      select: {
        totalSeconds: true,
        playedDays: true,
      },
    })

    return {
      success: true,
      totalSeconds: stat.totalSeconds,
      playedDays: stat.playedDays,
    }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    ) {
      return { success: true, totalSeconds: 0, playedDays: 0 }
    }
    console.error('logMaterialPlaytime failed', error)
    return { success: false, message: '记录播放时长失败' }
  }
}
