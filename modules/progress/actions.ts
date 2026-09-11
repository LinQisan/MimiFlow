'use server'

import { revalidatePath } from 'next/cache'
import { StudyTimeKind } from '@prisma/client'
import { recordStudyTime } from '@/modules/progress/server/study-time-service'

export async function logStudyTime(kind: StudyTimeKind, seconds: number) {
  try {
    await recordStudyTime(kind, seconds)
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}
