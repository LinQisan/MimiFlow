import 'server-only'

import prisma from '@/lib/prisma'

export async function getAttemptStatsByQuestionIds(userId: string, questionIds: string[]) {
  const groups = await prisma.questionAttempt.groupBy({
    by: ['questionId', 'isCorrect'],
    where: { userId, questionId: { in: questionIds } },
    _count: { _all: true },
  })
  const stats = new Map<string, { total: number; correct: number }>()
  for (const group of groups) {
    const current = stats.get(group.questionId) || { total: 0, correct: 0 }
    current.total += group._count._all
    if (group.isCorrect) current.correct += group._count._all
    stats.set(group.questionId, current)
  }
  return stats
}
