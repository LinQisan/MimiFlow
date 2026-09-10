'use server'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { executeAction } from '@/lib/actions/result'
import type { PronunciationChoice } from './domain/personal-pronunciation'

export async function getMaterialPronunciationChoices(materialId: string) {
  const userId = await getCurrentUserId()
  return prisma.materialPronunciationChoice.findMany({
    where: { userId, materialId },
    select: { location: true, sourceText: true, start: true, surface: true, reading: true },
  })
}

export async function saveMaterialPronunciationChoice(materialId: string, choice: PronunciationChoice) {
  return executeAction(async () => {
    const userId = await getCurrentUserId()
    if (!choice || typeof choice.sourceText !== 'string' || typeof choice.location !== 'string' ||
      typeof choice.surface !== 'string' || typeof choice.reading !== 'string' ||
      !choice.location || choice.location.length > 300 || choice.sourceText.length > 100000 ||
      !Number.isInteger(choice.start) || choice.start < 0 || !choice.surface ||
      choice.sourceText.slice(choice.start, choice.start + choice.surface.length) !== choice.surface ||
      !/^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・|]+$/u.test(choice.reading) || choice.reading.length > 200) {
      throw new Error('读音或原文位置无效')
    }
    const material = await prisma.material.findFirst({ where: { id: materialId, type: 'READING' }, select: { id: true } })
    if (!material) throw new Error('阅读材料不存在')
    await prisma.materialPronunciationChoice.upsert({
      where: { userId_materialId_location_start: { userId, materialId, location: choice.location, start: choice.start } },
      create: { userId, materialId, location: choice.location, start: choice.start, sourceText: choice.sourceText, surface: choice.surface, reading: choice.reading },
      update: { sourceText: choice.sourceText, surface: choice.surface, reading: choice.reading },
    })
    return { choice }
  }, { fallbackMessage: '读音保存失败，请重试' })
}
