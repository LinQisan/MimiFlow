'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { StudyTimeKind } from '@prisma/client'

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function logStudyTime(kind: StudyTimeKind, seconds: number) {
  try {
    const safeSeconds = Math.max(0, Math.min(180, Math.round(seconds)))
    if (safeSeconds <= 0) return { success: true }
    const dateKey = toDateKey(new Date())

    await prisma.studyTimeDaily.upsert({
      where: {
        dateKey_kind: {
          dateKey,
          kind,
        },
      },
      create: {
        dateKey,
        kind,
        seconds: safeSeconds,
      },
      update: {
        seconds: { increment: safeSeconds },
      },
    })

    revalidatePath('/game')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}
