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
import {
  normalizeQuestionTextFields,
  normalizeSortingPrompt,
  parseSortingPrompt,
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'
import { getPaperReadingMaterialTitle } from '@/modules/questions/domain/paper-editor'
import {
  normalizePaperAttributes,
  PAPER_ACCEPTED_MATERIAL_TYPES,
} from '@/modules/practice/domain/paper-attributes'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/modules/practice/server/vocabulary-analytics'

type QuestionOptionInput = {
  text?: string | null
  imageUrl?: string | null
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
  questionType?: string | null
  content?: string | null
  paperId?: string | null
  description?: string | null
  sourceKind?: string | null
  publishedDate?: string | null
  edition?: string | null
  newsSource?: string | null
  newsType?: string | null
  newsSection?: string | null
  newsColumn?: string | null
  newsTopic?: string | null
  questions?: ArticleQuestionInput[] | null
}

type CreateQuizQuestionPayload = {
  paperId?: string | null
  questionType?: string | null
  prompt?: string | null
  contextSentence?: string | null
  targetWord?: string | null
  sortingOrder?: number[] | null
  explanation?: string | null
  options?: QuestionOptionInput[] | null
}

const resolveMaterialId = async (type: MaterialType, id: string) => {
  const direct = await prisma.material.findUnique({
    where: { id },
    select: { id: true, type: true },
  })
  if (direct && direct.type === type) return direct.id
  return null
}

const normalizeOptions = (
  optionsInput: QuestionOptionInput[] | null | undefined,
): { text: string; imageUrl?: string; isCorrect: boolean }[] => {
  const source = Array.isArray(optionsInput) ? optionsInput : []
  if (source.length > 0 && source.length < MIN_QUESTION_OPTION_COUNT) {
    throw new Error(`每道题至少需要 ${MIN_QUESTION_OPTION_COUNT} 个选项。`)
  }
  const normalized =
    source.length > 0
      ? source.map((option) => ({
          text: (option?.text || '').trim(),
          ...((option?.imageUrl || '').trim()
            ? { imageUrl: (option?.imageUrl || '').trim() }
            : {}),
          isCorrect: Boolean(option?.isCorrect),
        }))
      : [
          { text: '选项 1', isCorrect: true },
          { text: '选项 2', isCorrect: false },
          { text: '选项 3', isCorrect: false },
          { text: '选项 4', isCorrect: false },
        ]
  if (!normalized.some((option) => option.isCorrect))
    normalized[0].isCorrect = true
  return normalized
}

const normalizeSortingOrder = (
  value: number[] | null | undefined,
  optionCount: number,
) => {
  if (!Array.isArray(value) || value.length !== optionCount) return []
  const normalized = value.map(Number)
  const expected = Array.from({ length: optionCount }, (_, index) => index)
  return [...new Set(normalized)]
    .sort((a, b) => a - b)
    .every((index, position) => index === expected[position])
    ? normalized
    : []
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'

export async function createArticle(data: CreateArticlePayload) {
  try {
    const articleTitle = (data.title || '').trim()
    const content = (data.content || '').trim()
    const collectionId = (data.paperId || '').trim()
    const isNews = data.sourceKind === 'NEWS'
    if (!collectionId) {
      return { success: false, message: '请选择所属集合。' }
    }
    if (!content) {
      return { success: false, message: '文章正文不能为空。' }
    }
    if (isNews && !articleTitle) {
      return { success: false, message: '请填写新闻标题。' }
    }
    if (
      isNews &&
      (!['日経', '朝日'].includes((data.newsSource || '').trim()) ||
        !['news', 'editorial', 'column'].includes((data.newsType || '').trim()) ||
        (!(data.newsSection || '').trim() && data.newsType !== 'column'))
    ) {
      return { success: false, message: '请完整选择新闻类型、来源和版面。' }
    }
    if (isNews && data.newsType === 'column' && !['春秋', '天声人語'].includes((data.newsColumn || '').trim())) {
      return { success: false, message: '请选择专栏名称。' }
    }
    if (
      isNews &&
      data.newsType === 'column' &&
      ((data.newsColumn === '春秋' && data.newsSource !== '日経') ||
        (data.newsColumn === '天声人語' && data.newsSource !== '朝日'))
    ) {
      return { success: false, message: '专栏与新闻来源不一致，请重新选择。' }
    }
    const automaticMorningEdition =
      isNews &&
      ((data.newsType === 'column' &&
        (data.newsColumn === '春秋' || data.newsColumn === '天声人語')) ||
        (data.newsType === 'editorial' && data.newsSource === '日経'))
    if (
      isNews &&
      data.edition === 'FLASH' &&
      !(data.newsSource === '日経' && data.newsType === 'news')
    ) {
      return { success: false, message: '速報刊面仅用于日経普通新闻。' }
    }
    const automaticFrontPageSection =
      isNews &&
      data.newsType === 'column' &&
      (data.newsColumn === '春秋' || data.newsColumn === '天声人語')
    const newsSection = automaticFrontPageSection
      ? '一面'
      : (data.newsSection || '').trim()
    const exists = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, collectionType: true, acceptedMaterialTypes: true },
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
    const isPaperArticle = exists.collectionType === CollectionType.PAPER
    const normalizedQuestions = isPaperArticle
      ? (data.questions || []).map((q, index) => {
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
      : []
    const paperQuestionType = toSafeQuestionType(
      (data.questionType || '').trim(),
      QuestionType.READING_COMPREHENSION,
    )
    const materialTitle =
      exists.collectionType === CollectionType.PAPER
        ? getPaperReadingMaterialTitle(paperQuestionType)
        : articleTitle || '未命名阅读材料'

    const createdMaterial = await prisma.$transaction(async tx => {
      const lastMaterial = await tx.collectionMaterial.aggregate({
        where: { collectionId },
        _max: { sortOrder: true },
      })
      const nextMaterialOrder = (lastMaterial._max.sortOrder ?? -1) + 1

      return tx.material.create({
        data: {
          type: MaterialType.READING,
          title: materialTitle,
          contentPayload: encodeMaterialPayload(MaterialType.READING, {
            text: content,
            description: (data.description || '').trim() || null,
            sourceKind: isNews ? 'NEWS' : 'ARTICLE',
            publishedDate: isNews ? (data.publishedDate || '').trim() : '',
            edition:
              automaticMorningEdition
                ? 'MORNING'
                : isNews && ['MORNING', 'EVENING', 'FLASH'].includes(data.edition || '')
                ? data.edition
                : '',
            newsSource: isNews && ['日経', '朝日'].includes((data.newsSource || '').trim())
              ? (data.newsSource || '').trim()
              : '',
            newsType: isNews && ['news', 'editorial', 'column'].includes((data.newsType || '').trim())
              ? (data.newsType || '').trim()
              : '',
            newsSection: isNews ? newsSection : '',
            newsColumn: isNews && ['春秋', '天声人語'].includes((data.newsColumn || '').trim())
              ? (data.newsColumn || '').trim()
              : '',
            newsTopic: isNews ? (data.newsTopic || '').trim() : '',
          }),
          collectionMaterials: {
            create: {
              collectionId,
              sortOrder: nextMaterialOrder,
            },
          },
          questions: {
            create: normalizedQuestions.map((q) => ({
              questionType: q.questionType,
              content: encodeQuestionContent(
                toQuestionRecordPayload(
                  q.prompt,
                  q.contextSentence,
                  null,
                  q.explanation || null,
                ),
              ),
              prompt: q.prompt,
              context: q.contextSentence,
              analysis: q.explanation || null,
              ...toQuestionOptionsAndAnswer(q.options),
              sortOrder: q.order,
            })),
          },
        },
        select: { id: true },
      })
    })
    await precomputePracticeVocabularyMaterialAnalyses([createdMaterial.id])
    invalidatePracticeVocabularyAnalytics()
    return {
      success: true,
      message:
        exists.collectionType === CollectionType.PAPER
          ? '阅读文章与题目已保存。'
          : '文章已保存。',
    }
  } catch (error: unknown) {
    console.error('createArticle failed:', getErrorMessage(error), error)
    return { success: false, message: '发布失败' }
  }
}

export async function moveReadingMaterialToPaper(input: {
  materialId?: string | null
  sourcePaperId?: string | null
  targetPaperId?: string | null
}) {
  try {
    const materialId = (input.materialId || '').trim()
    const sourcePaperId = (input.sourcePaperId || '').trim()
    const targetPaperId = (input.targetPaperId || '').trim()
    if (!materialId || !sourcePaperId || !targetPaperId) {
      return { success: false, message: '请选择目标试卷。' }
    }
    if (sourcePaperId === targetPaperId) {
      return { success: false, message: '目标试卷不能是当前试卷。' }
    }

    const [sourceRelation, targetPaper, targetRelation] = await Promise.all([
      prisma.collectionMaterial.findUnique({
        where: {
          collectionId_materialId: {
            collectionId: sourcePaperId,
            materialId,
          },
        },
        select: { material: { select: { type: true } } },
      }),
      prisma.collection.findFirst({
        where: {
          id: targetPaperId,
          collectionType: CollectionType.PAPER,
        },
        select: { id: true, title: true },
      }),
      prisma.collectionMaterial.findUnique({
        where: {
          collectionId_materialId: {
            collectionId: targetPaperId,
            materialId,
          },
        },
        select: { materialId: true },
      }),
    ])
    if (!sourceRelation || sourceRelation.material.type !== MaterialType.READING) {
      return { success: false, message: '该阅读内容不属于当前试卷。' }
    }
    if (!targetPaper) {
      return { success: false, message: '目标试卷不存在或不支持阅读题。' }
    }

    await prisma.$transaction(async tx => {
      await tx.collection.update({
        where: { id: targetPaperId },
        data: { acceptedMaterialTypes: PAPER_ACCEPTED_MATERIAL_TYPES },
      })
      if (targetRelation) {
        await tx.collectionMaterial.delete({
          where: {
            collectionId_materialId: {
              collectionId: sourcePaperId,
              materialId,
            },
          },
        })
        return
      }
      const lastMaterial = await tx.collectionMaterial.aggregate({
        where: { collectionId: targetPaperId },
        _max: { sortOrder: true },
      })
      await tx.collectionMaterial.update({
        where: {
          collectionId_materialId: {
            collectionId: sourcePaperId,
            materialId,
          },
        },
        data: {
          collectionId: targetPaperId,
          sortOrder: (lastMaterial._max.sortOrder || 0) + 1,
        },
      })
    })

    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()

    revalidatePath('/manage/practice')
    revalidatePath(`/manage/practice/${sourcePaperId}`)
    revalidatePath(`/manage/practice/${targetPaperId}`)
    revalidatePath(`/practice/${sourcePaperId}`)
    revalidatePath(`/practice/${sourcePaperId}/do`)
    revalidatePath(`/practice/${targetPaperId}`)
    revalidatePath(`/practice/${targetPaperId}/do`)
    revalidatePath('/manage/reading')
    revalidatePath(`/manage/reading/${materialId}`)
    return {
      success: true,
      message: `已移动到“${targetPaper.title}”。`,
    }
  } catch (error: unknown) {
    console.error('moveReadingMaterialToPaper failed:', getErrorMessage(error), error)
    return { success: false, message: '移动失败，请重试。' }
  }
}

export async function createQuizQuestion(data: CreateQuizQuestionPayload) {
  try {
    if (!data.paperId) return { success: false, message: '请选择所属集合！' }

    const collection = await prisma.collection.findUnique({
      where: { id: data.paperId },
      select: { id: true, title: true, acceptedMaterialTypes: true },
    })
    if (!collection)
      return { success: false, message: '集合不存在，请刷新后重试。' }

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
        message: '未检测到题目内容。请填写题干，或使用快速粘贴自动解析。',
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
    const sortingOrder = normalizeSortingOrder(
      data.sortingOrder,
      normalizedOptions.length,
    )
    if (
      questionType === QuestionType.SORTING &&
      sortingOrder.length !== normalizedOptions.length
    ) {
      return {
        success: false,
        message: '问题6请按正确语序点击全部选项后再保存。',
      }
    }
    const persistedPrompt =
      questionType === QuestionType.SORTING
        ? normalizeSortingPrompt(promptText)
        : promptText
    const parsedSortingPrompt = parseSortingPrompt(persistedPrompt)
    if (
      questionType === QuestionType.SORTING &&
      (parsedSortingPrompt.slotCount !== normalizedOptions.length ||
        parsedSortingPrompt.starCount !== 1)
    ) {
      return {
        success: false,
        message: `问题6题干需要 ${normalizedOptions.length} 个排序位，并标出一个★位。`,
      }
    }
    const normalizedContext = supportsSeparateQuestionContext(questionType)
      ? questionText.context
      : null

    if (
      !collection.acceptedMaterialTypes.includes(MaterialType.VOCAB_GRAMMAR)
    ) {
      await prisma.collection.update({
        where: { id: collection.id },
        data: {
          acceptedMaterialTypes: {
            set: [
              ...collection.acceptedMaterialTypes,
              MaterialType.VOCAB_GRAMMAR,
            ],
          },
        },
      })
    }

    await prisma.question.create({
      data: {
        materialId: quizMaterialId,
        questionType,
        content: encodeQuestionContent({
          ...toQuestionRecordPayload(
            persistedPrompt || null,
            normalizedContext,
            usesExplicitQuestionTargetWord(questionType)
              ? (data.targetWord || '').trim() || null
              : null,
            (data.explanation || '').trim() || null,
          ),
          ...(questionType === QuestionType.SORTING
            ? {
                sortingOrder,
              }
            : {}),
        }),
        prompt: persistedPrompt || null,
        context: normalizedContext,
        analysis: (data.explanation || '').trim() || null,
        ...toQuestionOptionsAndAnswer(normalizedOptions),
        sortOrder: nextOrder,
      },
    })
    await precomputePracticeVocabularyMaterialAnalyses([quizMaterialId])
    invalidatePracticeVocabularyAnalytics()
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
  sourceKind?: string
  publishedDate?: string
  edition?: string
  newsSection?: string
  audioFile?: string
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
    const audioFile = (payload.audioFile || '').trim()
    if (audioFile && !audioFile.startsWith('/audios/')) {
      return { success: false, message: '文章音频路径无效。' }
    }
    const materialId = await resolveMaterialId(
      MaterialType.READING,
      payload.passageId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '阅读材料不存在。' }
    }

    await prisma.$transaction(async (tx) => {
      const currentMaterial = await tx.material.findUnique({
        where: { id: materialId },
        select: { contentPayload: true },
      })
      if (!currentMaterial) throw new Error('阅读材料不存在。')
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map((q) => q.id))

      await tx.material.update({
        where: { id: materialId },
        data: {
          title,
          contentPayload: patchMaterialPayload(
            MaterialType.READING,
            currentMaterial.contentPayload,
            {
              text: content,
              sourceKind: payload.sourceKind === 'NEWS' ? 'NEWS' : 'ARTICLE',
              publishedDate: (payload.publishedDate || '').trim(),
              edition: ['MORNING', 'EVENING', 'FLASH'].includes(
                payload.edition || '',
              )
                ? payload.edition
                : '',
              newsSection: (payload.newsSection || '').trim(),
              audioFile,
            },
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
        const normalizedContext = supportsSeparateQuestionContext(questionType)
          ? questionText.context
          : null
        const normalizedOptions = normalizeOptions(question.options)
        const nextQuestionData = {
          questionType,
          content: encodeQuestionContent(
            toQuestionRecordPayload(
              promptText || null,
              normalizedContext,
              null,
              null,
            ),
          ),
          prompt: promptText || null,
          context: normalizedContext,
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
    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()

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
  shuffleOptions?: boolean
  sortingOrder?: number[] | null
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

    await prisma.$transaction(async (tx) => {
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map((q) => q.id))

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
        const normalizedContext = supportsSeparateQuestionContext(questionType)
          ? questionText.context
          : null
        const targetWord = usesExplicitQuestionTargetWord(questionType)
          ? (question.targetWord || '').trim() || null
          : null
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
        const sortingOrder = normalizeSortingOrder(
          question.sortingOrder,
          normalizedOptions.length,
        )
        if (
          questionType === QuestionType.SORTING &&
          sortingOrder.length !== normalizedOptions.length
        ) {
          throw new Error(`第 ${index + 1} 题尚未设置正确语序。`)
        }
        const optionLabelFormat = normalizeOptionLabelFormat(
          question.optionLabelFormat,
          'numeric',
        )
        const customOptionLabels = parseCustomOptionLabels(
          question.customOptionLabels,
        )
        if (
          optionLabelFormat === 'custom' &&
          customOptionLabels.length < normalizedOptions.length
        ) {
          throw new Error(`第 ${index + 1} 题的自定义序号不足，请用 | 分隔。`)
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
          shuffleOptions:
            question.shuffleOptions !== false &&
            !(
              questionType === QuestionType.LISTENING &&
              listeningSectionNumber === 3
            ),
          ...(questionType === QuestionType.SORTING
            ? {
                sortingOrder,
              }
            : {}),
        }
        const nextQuestionData = {
          questionType,
          content: encodeQuestionContent(
            questionType === QuestionType.LISTENING
              ? {
                  ...baseContent,
                  listeningSectionNumber,
                  listeningSectionTitle: '听力',
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
    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()

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
        payload.questions.find((question) => question.listeningSectionNumber)
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

    await prisma.$transaction(async (tx) => {
      const currentMaterial = await tx.material.findUnique({
        where: { id: materialId },
        select: { contentPayload: true },
      })
      if (!currentMaterial) throw new Error('听力材料不存在。')
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map((q) => q.id))

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
        const normalizedContext = supportsSeparateQuestionContext(questionType)
          ? questionText.context
          : null
        const targetWord = usesExplicitQuestionTargetWord(questionType)
          ? (question.targetWord || '').trim() || null
          : null
        const explanation = (question.explanation || '').trim() || null
        const normalizedOptions = normalizeOptions(question.options)
        const sortingOrder = normalizeSortingOrder(
          question.sortingOrder,
          normalizedOptions.length,
        )
        if (
          questionType === QuestionType.SORTING &&
          sortingOrder.length !== normalizedOptions.length
        ) {
          throw new Error(`第 ${index + 1} 题尚未设置正确语序。`)
        }
        const optionLabelFormat = normalizeOptionLabelFormat(
          question.optionLabelFormat,
          'numeric',
        )
        const customOptionLabels = parseCustomOptionLabels(
          question.customOptionLabels,
        )
        if (
          optionLabelFormat === 'custom' &&
          customOptionLabels.length < normalizedOptions.length
        ) {
          throw new Error(`第 ${index + 1} 题的自定义序号不足，请用 | 分隔。`)
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
          shuffleOptions:
            question.shuffleOptions !== false &&
            !(
              questionType === QuestionType.LISTENING &&
              listeningSectionNumber === 3
            ),
          ...(questionType === QuestionType.SORTING
            ? {
                sortingOrder,
              }
            : {}),
        }
        const nextQuestionData = {
          questionType,
          content:
            questionType === QuestionType.LISTENING
              ? {
                  ...baseContent,
                  listeningSectionNumber,
                  listeningSectionTitle: '听力',
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
            },
          ),
        },
      })
    })
    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/manage/listening')
    revalidatePath(`/manage/listening/${payload.lessonId.trim()}`)
    revalidatePath('/practice')

    return { success: true }
  } catch (error) {
    console.error('updateLessonQuestions failed:', error)
    const message =
      error instanceof Error ? error.message : '保存失败，请稍后重试。'
    return { success: false, message }
  }
}

export async function createCategory(data: {
  collectionType?: string
  levelId?: string
  name: string
  materialType?: MaterialType
  language?: string
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
    const typeLabel = collectionType === CollectionType.PAPER ? '试卷' : '分组'
    const paperAttributes = normalizePaperAttributes({
      title,
      language: data.language,
    })

    const newCategory = await prisma.collection.create({
      data: {
        title,
        collectionType,
        acceptedMaterialTypes:
          collectionType === CollectionType.PAPER
            ? paperAttributes.acceptedMaterialTypes
            : data.materialType
              ? [data.materialType]
              : [],
        language:
          collectionType === CollectionType.PAPER
            ? paperAttributes.language
            : data.language?.trim().toLowerCase() || null,
        level:
          collectionType === CollectionType.PAPER
            ? paperAttributes.level
            : null,
      },
      select: {
        id: true,
        title: true,
        collectionType: true,
        acceptedMaterialTypes: true,
        level: true,
      },
    })

    return {
      success: true,
      paper: {
        id: newCategory.id,
        name: newCategory.title,
        collectionType: newCategory.collectionType,
        acceptedMaterialTypes: newCategory.acceptedMaterialTypes,
        level: { title: newCategory.level || typeLabel },
      },
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '新建集合失败，请检查控制台。' }
  }
}
