'use server'

import { CollectionType, MaterialType, QuestionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import {
  encodeMaterialPayload,
  patchMaterialPayload,
} from '@/lib/codecs/material-payload'
import { encodeQuestionContent } from '@/lib/codecs/question-content'
import {
  normalizeQuestionTypeForMaterial,
  toQuestionOptionsAndAnswer,
  toQuestionRecordPayload,
  toSafeQuestionType,
} from '@/modules/practice/domain/question-record'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '@/utils/questions/optionLabels'
import { MIN_QUESTION_OPTION_COUNT } from '@/utils/questions/editorOptions'
import { normalizeQuestionTextFields } from '@/modules/practice/domain/question-text'

type QuestionOptionInput = {
  text?: string | null
  isCorrect?: boolean | null
}

type ArticleQuestionInput = {
  questionType?: string | null
  prompt?: string | null
  contextSentence?: string | null
  explanation?: string | null
  options?: QuestionOptionInput[] | null
}

type CreateArticlePayload = {
  title?: string | null
  content?: string | null
  paperId?: string | null
  description?: string | null
  questions?: ArticleQuestionInput[] | null
}

type CreateQuizQuestionPayload = {
  paperId?: string | null
  questionType?: string | null
  prompt?: string | null
  contextSentence?: string | null
  targetWord?: string | null
  explanation?: string | null
  options?: QuestionOptionInput[] | null
}

const resolveMaterialId = async (
  type: MaterialType,
  id: string,
) => {
  const direct = await prisma.material.findUnique({
    where: { id },
    select: { id: true, type: true },
  })
  if (direct && direct.type === type) return direct.id
  return null
}

const normalizeOptions = (
  optionsInput: QuestionOptionInput[] | null | undefined,
): { text: string; isCorrect: boolean }[] => {
  const source = Array.isArray(optionsInput) ? optionsInput : []
  if (source.length > 0 && source.length < MIN_QUESTION_OPTION_COUNT) {
    throw new Error(`每道题至少需要 ${MIN_QUESTION_OPTION_COUNT} 个选项。`)
  }
  const normalized =
    source.length > 0
      ? source.map(option => ({
          text: (option?.text || '').trim(),
          isCorrect: Boolean(option?.isCorrect),
        }))
      : [
          { text: '选项 1', isCorrect: true },
          { text: '选项 2', isCorrect: false },
          { text: '选项 3', isCorrect: false },
          { text: '选项 4', isCorrect: false },
        ]
  if (!normalized.some(option => option.isCorrect)) normalized[0].isCorrect = true
  return normalized
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'

export async function createArticle(data: CreateArticlePayload) {
  try {
    const articleTitle = (data.title || '').trim()
    const content = (data.content || '').trim()
    const collectionId = (data.paperId || '').trim()
    if (!collectionId) {
      return { success: false, message: '请选择所属集合。' }
    }
    if (!content) {
      return { success: false, message: '文章正文不能为空。' }
    }
    const normalizedQuestions = (data.questions || []).map((q, index) => {
      const questionText = normalizeQuestionTextFields(
        q.prompt,
        q.contextSentence,
      )
      return {
        questionType: toSafeQuestionType(
          (q.questionType || '').trim(),
          QuestionType.READING_COMPREHENSION,
        ),
        prompt: questionText.prompt,
        contextSentence: questionText.context,
        explanation: (q.explanation || '').trim(),
        order: index + 1,
        options: normalizeOptions(q.options),
      }
    })

    const exists = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, acceptedMaterialTypes: true },
    })
    if (!exists) {
      return { success: false, message: '所属集合不存在，请刷新后重试。' }
    }
    if (!exists.acceptedMaterialTypes.includes(MaterialType.READING)) {
      return {
        success: false,
        message: '该集合未设置为阅读内容集合，请重新选择。',
      }
    }

    await prisma.material.create({
      data: {
        type: MaterialType.READING,
        title: articleTitle || '未命名阅读材料',
        contentPayload: encodeMaterialPayload(MaterialType.READING, {
          text: content,
          description: (data.description || '').trim() || null,
        }),
        collectionMaterials: {
          create: {
            collectionId,
            sortOrder: 0,
          },
        },
        questions: {
          create: normalizedQuestions.map(q => ({
            questionType: q.questionType,
            content: encodeQuestionContent(toQuestionRecordPayload(
              q.prompt,
              q.contextSentence,
              null,
              q.explanation || null,
            )),
            prompt: q.prompt,
            context: q.contextSentence,
            analysis: q.explanation || null,
            ...toQuestionOptionsAndAnswer(q.options),
            sortOrder: q.order,
          })),
        },
      },
    })
    return { success: true, message: '文章及相关题目发布成功！' }
  } catch (error: unknown) {
    console.error('createArticle failed:', getErrorMessage(error), error)
    return { success: false, message: '发布失败' }
  }
}

export async function createQuizQuestion(data: CreateQuizQuestionPayload) {
  try {
    if (!data.paperId) return { success: false, message: '请选择所属集合！' }

    const collection = await prisma.collection.findUnique({
      where: { id: data.paperId },
      select: { id: true, title: true },
    })
    if (!collection) return { success: false, message: '集合不存在，请刷新后重试。' }

    let quizMaterialId =
      (
        await prisma.collectionMaterial.findFirst({
          where: {
            collectionId: data.paperId,
            material: { type: MaterialType.VOCAB_GRAMMAR },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { materialId: true },
        })
      )?.materialId || ''

    if (!quizMaterialId) {
      const created = await prisma.material.create({
        data: {
          type: MaterialType.VOCAB_GRAMMAR,
          title: `${collection.title}`,
          contentPayload: encodeMaterialPayload(MaterialType.VOCAB_GRAMMAR, {
            title: collection.title,
          }),
          collectionMaterials: {
            create: {
              collectionId: data.paperId,
              sortOrder: 0,
            },
          },
        },
        select: { id: true },
      })
      quizMaterialId = created.id
    }

    const maxOrder = await prisma.question.aggregate({
      where: { materialId: quizMaterialId },
      _max: { sortOrder: true },
    })
    const nextOrder = (maxOrder._max.sortOrder || 0) + 1
    const questionText = normalizeQuestionTextFields(
      data.prompt,
      data.contextSentence,
    )
    const promptText = questionText.prompt || ''
    const contextText = questionText.context || ''
    if (!promptText && !contextText) {
      return {
        success: false,
        message:
          '未检测到题目内容。请填写“题目呈现”或“语境句”，或使用快速粘贴自动解析。',
      }
    }
    const rawQuestionType = toSafeQuestionType(
      (data.questionType || '').trim(),
      QuestionType.PRONUNCIATION,
    )
    const questionType = normalizeQuestionTypeForMaterial(
      MaterialType.VOCAB_GRAMMAR,
      rawQuestionType,
    )
    const normalizedOptions = normalizeOptions(data.options)
    const normalizedContext = questionText.context

    await prisma.question.create({
      data: {
        materialId: quizMaterialId,
        questionType,
        content: encodeQuestionContent(toQuestionRecordPayload(
          promptText || null,
          normalizedContext,
          (data.targetWord || '').trim() || null,
          (data.explanation || '').trim() || null,
        )),
        prompt: promptText || null,
        context: normalizedContext,
        analysis: (data.explanation || '').trim() || null,
        ...toQuestionOptionsAndAnswer(normalizedOptions),
        sortOrder: nextOrder,
      },
    })
    return { success: true, message: '题目录入成功！' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '题目创建失败。' }
  }
}

type EditableArticleOptionInput = {
  id?: string
  text?: string
  isCorrect?: boolean
}

type EditableArticleQuestionInput = {
  id?: string
  questionType?: string
  prompt?: string | null
  contextSentence?: string | null
  options?: EditableArticleOptionInput[]
}

type UpdateArticlePayload = {
  passageId: string
  title: string
  content: string
  questions: EditableArticleQuestionInput[]
}

export async function updateArticleWithQuestions(
  payload: UpdateArticlePayload,
) {
  try {
    const title = payload.title.trim()
    const content = payload.content.trim()
    if (!payload.passageId) {
      return { success: false, message: '文章 ID 缺失。' }
    }
    if (!content) {
      return { success: false, message: '请填写文章正文。' }
    }
    const materialId = await resolveMaterialId(
      MaterialType.READING,
      payload.passageId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '阅读材料不存在。' }
    }

    await prisma.$transaction(async tx => {
      const currentMaterial = await tx.material.findUnique({
        where: { id: materialId },
        select: { contentPayload: true },
      })
      if (!currentMaterial) throw new Error('阅读材料不存在。')
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))

      await tx.material.update({
        where: { id: materialId },
        data: {
          title,
          contentPayload: patchMaterialPayload(
            MaterialType.READING,
            currentMaterial.contentPayload,
            { text: content },
          ),
        },
      })

      const keepQuestionIds: string[] = []
      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const questionText = normalizeQuestionTextFields(
          question.prompt,
          question.contextSentence,
        )
        const promptText = questionText.prompt || ''
        const questionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.READING_COMPREHENSION,
        )
        const normalizedContext = questionText.context
        const normalizedOptions = normalizeOptions(question.options)
        const nextQuestionData = {
          questionType,
          content: encodeQuestionContent(toQuestionRecordPayload(
            promptText || null,
            normalizedContext,
            null,
            null,
          )),
          prompt: promptText || null,
          context: normalizedContext,
          ...toQuestionOptionsAndAnswer(normalizedOptions),
          sortOrder: index + 1,
        }

        const incomingQuestionId = (question.id || '').trim()
        if (incomingQuestionId && existingQuestionIdSet.has(incomingQuestionId)) {
          keepQuestionIds.push(incomingQuestionId)
          await tx.question.update({
            where: { id: incomingQuestionId },
            data: nextQuestionData,
          })
        } else {
          const createdQuestion = await tx.question.create({
            data: {
              materialId,
              ...nextQuestionData,
            },
            select: { id: true },
          })
          keepQuestionIds.push(createdQuestion.id)
        }
      }

      await tx.question.deleteMany({
        where: {
          materialId,
          id: { notIn: keepQuestionIds },
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/reading')
    revalidatePath('/reading/articles/[id]', 'page')

    return { success: true }
  } catch (error) {
    console.error('updateArticleWithQuestions failed:', error)
    return { success: false, message: '保存失败，请稍后重试。' }
  }
}

type EditableQuizOptionInput = {
  id?: string
  text?: string
  isCorrect?: boolean
}

type EditableQuizQuestionInput = {
  id?: string
  questionType?: string
  prompt?: string | null
  contextSentence?: string | null
  targetWord?: string | null
  explanation?: string | null
  listeningSectionNumber?: string | null
  optionLabelFormat?: string | null
  customOptionLabels?: string | string[] | null
  options?: EditableQuizOptionInput[]
}

type UpdateQuizPayload = {
  quizId: string
  title: string
  questions: EditableQuizQuestionInput[]
}

export async function updateQuizWithQuestions(payload: UpdateQuizPayload) {
  try {
    const title = payload.title.trim()
    if (!payload.quizId) {
      return { success: false, message: '题库 ID 缺失。' }
    }
    if (!title) {
      return { success: false, message: '题库名称不能为空。' }
    }
    const materialId = await resolveMaterialId(
      MaterialType.VOCAB_GRAMMAR,
      payload.quizId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '题库材料不存在。' }
    }

    await prisma.$transaction(async tx => {
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))

      await tx.material.update({
        where: { id: materialId },
        data: { title },
      })

      const keepQuestionIds: string[] = []

      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const questionText = normalizeQuestionTextFields(
          question.prompt,
          question.contextSentence,
        )
        const promptText = questionText.prompt || ''
        const rawQuestionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.PRONUNCIATION,
        )
        const questionType = normalizeQuestionTypeForMaterial(
          MaterialType.VOCAB_GRAMMAR,
          rawQuestionType,
        )
        const normalizedContext = questionText.context
        const targetWord = (question.targetWord || '').trim() || null
        const explanation = (question.explanation || '').trim() || null
        const listeningSectionNumberText = String(
          question.listeningSectionNumber || '',
        ).trim()
        let listeningSectionNumber: number | null = null
        if (listeningSectionNumberText) {
          const parsedNumber = Number(listeningSectionNumberText)
          if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
            throw new Error('听力所属部分请填写大于 0 的数字。')
          }
          listeningSectionNumber = Math.floor(parsedNumber)
        }

        const normalizedOptions = normalizeOptions(question.options)
        const optionLabelFormat = normalizeOptionLabelFormat(
          question.optionLabelFormat,
          questionType === QuestionType.LISTENING ? 'numeric' : 'upper-alpha',
        )
        const customOptionLabels = parseCustomOptionLabels(
          question.customOptionLabels,
        )
        if (
          optionLabelFormat === 'custom' &&
          customOptionLabels.length < normalizedOptions.length
        ) {
          throw new Error(
            `第 ${index + 1} 题的自定义序号不足，请用 | 分隔。`,
          )
        }
        const baseContent = {
          ...toQuestionRecordPayload(
            promptText || null,
            normalizedContext,
            targetWord,
            explanation,
          ),
          optionLabelFormat,
          customOptionLabels,
        }
        const nextQuestionData = {
          questionType,
          content: encodeQuestionContent(
            questionType === QuestionType.LISTENING
              ? {
                  ...baseContent,
                  listeningSectionNumber,
                  sectionNumber: listeningSectionNumber,
                  listeningSectionTitle: '听力',
                  sectionTitle: '听力',
                }
              : baseContent,
          ),
          prompt: promptText || null,
          context: normalizedContext,
          analysis: explanation,
          ...toQuestionOptionsAndAnswer(normalizedOptions),
          sortOrder: index + 1,
        }

        const incomingQuestionId = (question.id || '').trim()
        if (
          incomingQuestionId &&
          existingQuestionIdSet.has(incomingQuestionId)
        ) {
          keepQuestionIds.push(incomingQuestionId)

          await tx.question.update({
            where: { id: incomingQuestionId },
            data: nextQuestionData,
          })
        } else {
          const createdQuestion = await tx.question.create({
            data: {
              materialId,
              ...nextQuestionData,
            },
            select: { id: true },
          })
          keepQuestionIds.push(createdQuestion.id)
        }
      }

      await tx.question.deleteMany({
        where: {
          materialId,
          id: { notIn: keepQuestionIds },
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/practice')

    return { success: true }
  } catch (error) {
    console.error('updateQuizWithQuestions failed:', error)
    return { success: false, message: '保存失败，请稍后重试。' }
  }
}

type UpdateLessonQuestionsPayload = {
  lessonId: string
  listeningSectionNumber?: string | null
  questions: EditableQuizQuestionInput[]
}

export async function updateLessonQuestions(
  payload: UpdateLessonQuestionsPayload,
) {
  try {
    if (!payload.lessonId) {
      return { success: false, message: '听力 ID 缺失。' }
    }
    const materialId = await resolveMaterialId(
      MaterialType.LISTENING,
      payload.lessonId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '听力材料不存在。' }
    }
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
      return { success: false, message: '听力材料至少需要一道题目。' }
    }

    const listeningSectionNumberText = String(
      payload.listeningSectionNumber ||
        payload.questions.find(question => question.listeningSectionNumber)
          ?.listeningSectionNumber ||
        '',
    ).trim()
    if (!listeningSectionNumberText) {
      return { success: false, message: '请设置材料所属問題。' }
    }
    let listeningSectionNumber: number | null = null
    if (listeningSectionNumberText) {
      const parsedNumber = Number(listeningSectionNumberText)
      if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
        return { success: false, message: '所属問題请填写大于 0 的数字。' }
      }
      listeningSectionNumber = Math.floor(parsedNumber)
    }

    await prisma.$transaction(async tx => {
      const currentMaterial = await tx.material.findUnique({
        where: { id: materialId },
        select: { contentPayload: true },
      })
      if (!currentMaterial) throw new Error('听力材料不存在。')
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))

      const keepQuestionIds: string[] = []

      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const questionText = normalizeQuestionTextFields(
          question.prompt,
          question.contextSentence,
        )
        const promptText = questionText.prompt || ''
        const questionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.PRONUNCIATION,
        )
        const normalizedContext = questionText.context
        const targetWord = (question.targetWord || '').trim() || null
        const explanation = (question.explanation || '').trim() || null
        const normalizedOptions = normalizeOptions(question.options)
        const optionLabelFormat = normalizeOptionLabelFormat(
          question.optionLabelFormat,
          questionType === QuestionType.LISTENING ? 'numeric' : 'upper-alpha',
        )
        const customOptionLabels = parseCustomOptionLabels(
          question.customOptionLabels,
        )
        if (
          optionLabelFormat === 'custom' &&
          customOptionLabels.length < normalizedOptions.length
        ) {
          throw new Error(
            `第 ${index + 1} 题的自定义序号不足，请用 | 分隔。`,
          )
        }
        const baseContent = {
          ...toQuestionRecordPayload(
            promptText || null,
            normalizedContext,
            targetWord,
            explanation,
          ),
          optionLabelFormat,
          customOptionLabels,
        }
        const nextQuestionData = {
          questionType,
          content:
            questionType === QuestionType.LISTENING
              ? {
                  ...baseContent,
                  listeningSectionNumber,
                  sectionNumber: listeningSectionNumber,
                  listeningSectionTitle: '听力',
                  sectionTitle: '听力',
                }
              : baseContent,
          prompt: promptText || null,
          context: normalizedContext,
          analysis: explanation,
          ...toQuestionOptionsAndAnswer(normalizedOptions),
          sortOrder: index + 1,
        }

        const incomingQuestionId = (question.id || '').trim()
        if (
          incomingQuestionId &&
          existingQuestionIdSet.has(incomingQuestionId)
        ) {
          keepQuestionIds.push(incomingQuestionId)

          await tx.question.update({
            where: { id: incomingQuestionId },
            data: nextQuestionData,
          })
        } else {
          const createdQuestion = await tx.question.create({
            data: {
              materialId,
              ...nextQuestionData,
            },
            select: { id: true },
          })
          keepQuestionIds.push(createdQuestion.id)
        }
      }

      await tx.question.deleteMany({
        where: {
          materialId,
          id: { notIn: keepQuestionIds },
        },
      })
      await tx.material.update({
        where: { id: materialId },
        data: {
          contentPayload: patchMaterialPayload(
            MaterialType.LISTENING,
            currentMaterial.contentPayload,
            {
            questionEntryRequired: false,
            listeningSectionNumber,
            sectionNumber: listeningSectionNumber,
            },
          ),
        },
      })
    })

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/manage/listening')
    revalidatePath(`/manage/listening/${payload.lessonId.trim()}`)
    revalidatePath('/practice')

    return { success: true }
  } catch (error) {
    console.error('updateLessonQuestions failed:', error)
    const message = error instanceof Error ? error.message : '保存失败，请稍后重试。'
    return { success: false, message }
  }
}

export async function createCategory(data: {
  collectionType?: string
  levelId?: string
  name: string
  materialType?: MaterialType
}) {
  try {
    const title = (data.name || '').trim()
    if (!title) {
      return { success: false, message: '集合名称不能为空。' }
    }
    const requestedType = (data.collectionType || data.levelId || '').trim()
    const collectionType =
      requestedType === CollectionType.CUSTOM_GROUP
        ? CollectionType.CUSTOM_GROUP
        : CollectionType.PAPER
    const typeLabel =
      collectionType === CollectionType.PAPER
        ? '试卷'
        : '分组'

    const newCategory = await prisma.collection.create({
      data: {
        title,
        collectionType,
        acceptedMaterialTypes: data.materialType ? [data.materialType] : [],
      },
      select: {
        id: true,
        title: true,
        collectionType: true,
        acceptedMaterialTypes: true,
      },
    })

    return {
      success: true,
      paper: {
        id: newCategory.id,
        name: newCategory.title,
        collectionType: newCategory.collectionType,
        acceptedMaterialTypes: newCategory.acceptedMaterialTypes,
        level: { title: typeLabel },
      },
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '新建集合失败，请检查控制台。' }
  }
}
