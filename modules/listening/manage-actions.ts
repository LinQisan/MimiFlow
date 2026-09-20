'use server'

// Listening title actions.

import { MaterialType } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/modules/practice/server/vocabulary-analytics'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { actionFailure, actionSuccess } from '@/lib/actions/result'
import {
  decodeMaterialPayload,
  patchMaterialPayload,
} from '@/lib/codecs/material-payload'
import { DomainError } from '@/lib/errors/domain-error'
import { formDataObject, parseInput } from '@/lib/validation/schema'
import { updateDialogueTextAtId } from './domain/dialogue-editor'
import {
  getTimelineRangeError,
  updateDialogueTimelineAtId,
} from './domain/timeline'
import {
  convertRawSubtitlesToTimeline,
  parseSubtitleToRawSubtitles,
} from '@/modules/import/audio/ass'

const materialIdSchema = z.string().trim().min(1, '材料 ID 缺失。')
const speakingTitleSchema = z.object({
  id: materialIdSchema,
  title: z.string().trim().min(1, '标题不能为空。'),
})
const deleteAudioMaterialSchema = z.object({ id: materialIdSchema })
const dialogueTextSchema = z.object({
  id: materialIdSchema,
  dialogueId: z.string().trim().min(1, '时间轴文本 ID 缺失。'),
  text: z.string().trim().min(1, '文本不能为空。').max(10000, '文本过长。'),
})
const optionalAudioDurationSchema = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().finite().nonnegative().optional(),
)
const dialogueTimelineSchema = z.object({
  id: materialIdSchema,
  dialogueId: z.string().trim().min(1, '时间轴文本 ID 缺失。'),
  start: z.coerce.number().finite(),
  end: z.coerce.number().finite(),
  audioDuration: optionalAudioDurationSchema,
})
const MAX_SUBTITLE_FILE_BYTES = 5 * 1024 * 1024

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
    const { id, dialogueId, text } = parseInput(
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
    const dialogues = updateDialogueTextAtId(
      payload.dialogues,
      dialogueId,
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
    await precomputePracticeVocabularyMaterialAnalyses([material.id])
    invalidatePracticeVocabularyAnalytics()

    revalidatePath(`/manage/listening/${material.id}`)
    revalidatePath(`/listening/${material.id}`)
    revalidatePath('/listening')
    return actionSuccess({ text }, '文本已更新。')
  } catch (error) {
    return actionFailure(error, '更新文本失败。')
  }
}

export async function updateListeningDialogueTimeline(formData: FormData) {
  try {
    const { id, dialogueId, start, end, audioDuration } = parseInput(
      dialogueTimelineSchema,
      formDataObject(formData),
    )
    const rangeError = getTimelineRangeError({
      start,
      end,
      audioDuration,
    })
    if (rangeError) {
      throw new DomainError('VALIDATION_ERROR', rangeError)
    }

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
    const dialogues = updateDialogueTimelineAtId(
      payload.dialogues,
      dialogueId,
      { start, end },
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
    return actionSuccess({ start, end }, '时间轴已保存。')
  } catch (error) {
    return actionFailure(error, '保存时间轴失败。')
  }
}

export async function replaceListeningSubtitles(formData: FormData) {
  try {
    const id = parseInput(materialIdSchema, formData.get('id'))
    const subtitleFile = formData.get('subtitleFile')
    if (!(subtitleFile instanceof File) || subtitleFile.size === 0) {
      throw new DomainError('VALIDATION_ERROR', '请选择 ASS 或 SRT 字幕文件。')
    }
    const extension =
      subtitleFile.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
    if (!['.ass', '.ssa', '.srt'].includes(extension)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        '仅支持 .ass、.ssa 或 .srt 字幕文件。',
      )
    }
    if (subtitleFile.size > MAX_SUBTITLE_FILE_BYTES) {
      throw new DomainError(
        'VALIDATION_ERROR',
        '字幕文件不能超过 5 MB。',
      )
    }

    const material = await prisma.material.findUnique({
      where: { id },
      select: { id: true, type: true, contentPayload: true },
    })
    if (!material || material.type !== MaterialType.LISTENING) {
      throw new DomainError('NOT_FOUND', '听力材料不存在。')
    }

    const rawSubtitles = parseSubtitleToRawSubtitles(
      await subtitleFile.text(),
      extension,
    )
    if (rawSubtitles.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        '文件中没有可识别的字幕行。',
      )
    }
    const dialogues = convertRawSubtitlesToTimeline(rawSubtitles).map(dialogue => ({
      ...dialogue,
      stableId: randomUUID(),
    }))

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
    await precomputePracticeVocabularyMaterialAnalyses([material.id])
    invalidatePracticeVocabularyAnalytics()

    revalidatePath(`/manage/listening/${material.id}`)
    revalidatePath(`/listening/${material.id}`)
    revalidatePath('/listening')
    return actionSuccess(
      { dialogues },
      `已用 ${dialogues.length} 句字幕覆盖当前时间轴。`,
    )
  } catch (error) {
    return actionFailure(error, '覆盖字幕失败。')
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
    invalidatePracticeVocabularyAnalytics()

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
