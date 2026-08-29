import 'server-only'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import type { ExamScoreRecordView } from '../domain'

export async function listExamScores(): Promise<ExamScoreRecordView[]> {
  const userId = await getCurrentUserId()
  const records = await prisma.examScoreRecord.findMany({
    where: { userId },
    orderBy: [{ examDate: 'desc' }, { createdAt: 'desc' }],
  })
  return records.map(record => ({
    id: record.id,
    examType: record.examType,
    examDate: record.examDate.toISOString().slice(0, 10),
    level: record.level,
    languageScore: record.languageScore,
    readingScore: record.readingScore,
    listeningScore: record.listeningScore,
    totalScore: record.totalScore,
  }))
}
