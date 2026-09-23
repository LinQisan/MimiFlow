import 'server-only'

import { StudyTimeKind } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { formatTokyoDateKey } from '@/utils/time/format'

export async function recordStudyTime(
  kind: StudyTimeKind,
  seconds: number,
) {
  const recordedSeconds = Math.max(0, Math.min(180, Math.round(seconds)))
  const dateKey = formatTokyoDateKey(new Date())
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
