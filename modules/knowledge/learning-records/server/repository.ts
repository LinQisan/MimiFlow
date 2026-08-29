import 'server-only'

import { LearningRecordKind } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

export async function listLearningRecords(kind?: LearningRecordKind) {
  const userId = await getCurrentUserId()
  return prisma.learningRecord.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  })
}
