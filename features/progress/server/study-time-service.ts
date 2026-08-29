import 'server-only'

import { StudyTimeKind } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function recordStudyTime(
  kind: StudyTimeKind,
  seconds: number,
) {
  const recordedSeconds = Math.max(0, Math.min(180, Math.round(seconds)))
  const dateKey = toDateKey(new Date())
  if (recordedSeconds <= 0) return { recordedSeconds, dateKey }

  const userId = await getCurrentUserId()
  await prisma.studyTimeDaily.upsert({
    where: {
      userId_dateKey_kind: { userId, dateKey, kind },
    },
    create: { userId, dateKey, kind, seconds: recordedSeconds },
    update: { seconds: { increment: recordedSeconds } },
  })

  return { recordedSeconds, dateKey }
}
