'use server'

// Listening title actions.

import { MaterialType } from '#prisma-client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { actionFailure, actionSuccess } from '@/lib/actions/result'
import {
  decodeMaterialPayload,
  patchMaterialPayload,
} from '@/lib/codecs/material-payload'
import { DomainError } from '@/lib/errors/domain-error'
import { formDataObject, parseInput } from '@/lib/validation/schema'
import { updateDialogueTextAtIndex } from './domain/dialogue-editor'

const materialIdSchema = z.string().trim().min(1, '材料 ID 缺失。')
const speakingTitleSchema = z.object({
  id: materialIdSchema,
  title: z.string().trim().min(1, '标题不能为空。'),
})
const deleteAudioMaterialSchema = z.object({ id: materialIdSchema })
const dialogueTextSchema = z.object({
  id: materialIdSchema,
  dialogueIndex: z.coerce.number().int().nonnegative(),
  text: z.string().trim().min(1, '文本不能为空。').max(10000, '文本过长。'),
})

async function resolveLessonMaterialId(maybeId: string) {
  const material = await prisma.material.findUnique({
    where: {
      id: maybeId,
    },
    select: { id: true, type: true },
  })
  return material &&
    (material.type === MaterialType.SPEAKING ||
      material.type === MaterialType.LISTENING)
    ? material.id
    : null
}

export async function updateSpeakingTitle(formData: FormData) {
  try {
    const { id: maybeId, title } = parseInput(
      speakingTitleSchema,
      formDataObject(formData),
    )

    const materialId = await resolveLessonMaterialId(maybeId)
    if (!materialId) throw new DomainError('NOT_FOUND', '材料不存在。')

    await prisma.material.update({ where: { id: materialId }, data: { title } })
    revalidatePath('/manage/shadowing')
    revalidatePath(`/manage/shadowing/${materialId}`)
    revalidatePath(`/listening/${materialId}`)
    return actionSuccess({}, '标题已更新。')
  } catch (error) {
    return actionFailure(error, '更新失败。')
  }
}

export async function updateListeningDialogueText(formData: FormData) {
  try {
    const { id, dialogueIndex, text } = parseInput(
      dialogueTextSchema,
      formDataObject(formData),
    )
    const material = await prisma.material.findUnique({
      where: { id },
      select: { id: true, type: true, contentPayload: true },
    })
    if (!material || material.type !== MaterialType.LISTENING) {
      throw new DomainError('NOT_FOUND', '听力材料不存在。')
    }

    const payload = decodeMaterialPayload(
      MaterialType.LISTENING,
      material.contentPayload,
    )
    const dialogues = updateDialogueTextAtIndex(
      payload.dialogues,
      dialogueIndex,
      text,
    )
    if (!dialogues) {
      throw new DomainError('NOT_FOUND', '未找到对应的时间轴文本。')
    }
    await prisma.material.update({
      where: { id: material.id },
      data: {
        contentPayload: patchMaterialPayload(
          MaterialType.LISTENING,
          material.contentPayload,
          { dialogues },
        ),
      },
    })

    revalidatePath(`/manage/listening/${material.id}`)
    revalidatePath(`/listening/${material.id}`)
    revalidatePath('/listening')
    return actionSuccess({ text }, '文本已更新。')
  } catch (error) {
    return actionFailure(error, '更新文本失败。')
  }
}

export async function deleteAudioMaterial(formData: FormData) {
  try {
    const { id: maybeId } = parseInput(
      deleteAudioMaterialSchema,
      formDataObject(formData),
    )

    const materialId = await resolveLessonMaterialId(maybeId)
    if (!materialId) throw new DomainError('NOT_FOUND', '材料不存在。')

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: {
        type: true,
        collectionMaterials: {
          select: { collectionId: true },
        },
      },
    })
    if (!material) throw new DomainError('NOT_FOUND', '材料不存在。')

    await prisma.material.delete({
      where: { id: materialId },
    })

    revalidatePath('/manage/listening')
    revalidatePath(`/manage/listening/${materialId}`)
    revalidatePath('/manage/shadowing')
    revalidatePath(`/manage/shadowing/${materialId}`)
    revalidatePath(`/listening/${materialId}`)
    revalidatePath('/listening')
    revalidatePath('/manage/practice')
    revalidatePath('/practice')
    revalidatePath('/manage/shadowing')
    revalidatePath('/manage/system/audio')
    material.collectionMaterials.forEach(item => {
      revalidatePath(`/manage/practice/${item.collectionId}`)
      revalidatePath(`/practice/${item.collectionId}`)
      revalidatePath('/manage/practice')
    })

    return actionSuccess(
      {},
      `${material.type === MaterialType.LISTENING ? '听力' : '跟读'}材料已删除，音频文件已保留。`,
    )
  } catch (error) {
    return actionFailure(error, '删除失败。')
  }
}
