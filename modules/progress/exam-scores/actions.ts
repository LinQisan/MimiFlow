'use server'

import { ExamScoreType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import {
  JLPT_LEVELS,
  isJlptSessionDate,
  type ExamScoreRecordView,
} from './domain'

const baseSchema = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择考试日期'),
})

const scoreSchema = z.number().int('分数必须是整数')

const saveExamScoreSchema = z.discriminatedUnion('examType', [
  baseSchema.extend({
    examType: z.literal(ExamScoreType.JLPT),
    level: z.enum(JLPT_LEVELS),
    languageScore: scoreSchema.min(0).max(60),
    readingScore: scoreSchema.min(0).max(60),
    listeningScore: scoreSchema.min(0).max(60),
  }),
  baseSchema.extend({
    examType: z.literal(ExamScoreType.TOEIC),
    readingScore: scoreSchema.min(0).max(495),
    listeningScore: scoreSchema.min(0).max(495),
  }),
])

export type SaveExamScoreInput = z.input<typeof saveExamScoreSchema>

const toView = (record: {
  id: string
  examType: ExamScoreType
  examDate: Date
  level: string | null
  languageScore: number | null
  readingScore: number
  listeningScore: number
  totalScore: number
}): ExamScoreRecordView => ({
  ...record,
  examDate: record.examDate.toISOString().slice(0, 10),
})

export async function saveExamScore(input: SaveExamScoreInput) {
  const parsed = saveExamScoreSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message || '成绩信息不正确',
    }
  }

  if (
    parsed.data.examType === ExamScoreType.JLPT &&
    !isJlptSessionDate(parsed.data.examDate)
  ) {
    return { success: false as const, message: '请选择官方已举行的 JLPT 场次' }
  }

  try {
    const userId = await getCurrentUserId()
    const data = parsed.data
    const languageScore =
      data.examType === ExamScoreType.JLPT ? data.languageScore : null
    const totalScore =
      (languageScore || 0) + data.readingScore + data.listeningScore
    const record = await prisma.examScoreRecord.create({
      data: {
        userId,
        examType: data.examType,
        examDate: new Date(`${data.examDate}T00:00:00.000Z`),
        level: data.examType === ExamScoreType.JLPT ? data.level : null,
        languageScore,
        readingScore: data.readingScore,
        listeningScore: data.listeningScore,
        totalScore,
      },
    })
    revalidatePath('/scores')
    return {
      success: true as const,
      message: '考试成绩已保存',
      record: toView(record),
    }
  } catch (error) {
    console.error('保存考试成绩失败:', error)
    return { success: false as const, message: '保存失败，请稍后重试' }
  }
}

export async function deleteExamScore(id: string) {
  try {
    const userId = await getCurrentUserId()
    const deleted = await prisma.examScoreRecord.deleteMany({
      where: { id: id.trim(), userId },
    })
    if (deleted.count === 0) {
      return { success: false as const, message: '这条成绩不存在' }
    }
    revalidatePath('/scores')
    return { success: true as const, message: '成绩记录已删除' }
  } catch (error) {
    console.error('删除考试成绩失败:', error)
    return { success: false as const, message: '删除失败，请稍后重试' }
  }
}
