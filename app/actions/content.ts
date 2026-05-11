// app/actions/content.ts
'use server'

import {
  CollectionType,
  MaterialType,
  QuestionTemplate,
  QuestionType,
  SourceType,
} from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import {
  buildVocabularyCanonicalKeys,
  normalizeVocabularyHeadword,
} from '@/utils/vocabulary/vocabularyCanonical'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import {
  sanitizePronunciation,
  sanitizePronunciations,
} from '@/utils/text/pronunciation'
import { toLegacyMaterialId } from '@/lib/repositories/materials'

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(
    new Set((list || []).map(item => item.trim()).filter(Boolean)),
  ).slice(0, 1)

type VocabularySentenceRecord = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  sourceType?: SourceType | null
  meaningIndex?: number | null
  posTags?: string[] | null
}

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
  language?: string | null
  level?: string | null
  questions?: ArticleQuestionInput[] | null
}

type CreateQuizQuestionPayload = {
  paperId?: string | null
  language?: string | null
  level?: string | null
  questionType?: string | null
  prompt?: string | null
  contextSentence?: string | null
  targetWord?: string | null
  explanation?: string | null
  options?: QuestionOptionInput[] | null
}

const QUESTION_TYPE_VALUES = new Set<string>(Object.values(QuestionType))

const toSafeQuestionType = (
  value: string | null | undefined,
  fallback: QuestionType,
) =>
  value && QUESTION_TYPE_VALUES.has(value) ? (value as QuestionType) : fallback

const toTemplateType = (questionType: QuestionType): QuestionTemplate => {
  if (questionType === QuestionType.FILL_BLANK) return QuestionTemplate.FILL_BLANK
  if (questionType === QuestionType.SORTING) return QuestionTemplate.CLOZE_TEST
  return QuestionTemplate.CHOICE_QUIZ
}

const normalizeQuestionTypeForMaterial = (
  materialType: MaterialType,
  questionType: QuestionType,
): QuestionType => {
  if (materialType === MaterialType.VOCAB_GRAMMAR) {
    if (
      questionType === QuestionType.FILL_BLANK ||
      questionType === QuestionType.READING_COMPREHENSION
    ) {
      return QuestionType.GRAMMAR
    }
  }
  return questionType
}

const toQuestionRecordPayload = (
  questionType: QuestionType,
  prompt: string | null,
  context: string,
  targetWord: string | null,
  explanation: string | null,
) => ({
  questionType,
  prompt,
  contextSentence: context,
  targetWord,
  explanation,
})

const toQuestionOptionsAndAnswer = (
  options: Array<{ text: string; isCorrect: boolean }>,
) => {
  const rows = options.map((option, index) => ({
    id: `opt_${index + 1}`,
    text: option.text,
  }))
  const answer = rows
    .filter((_, index) => options[index]?.isCorrect)
    .map(item => item.id)
  return {
    options: rows,
    answer: answer.length > 0 ? answer : [rows[0]?.id || 'opt_1'],
  }
}

const resolveMaterialIdByLegacy = async (
  type: MaterialType,
  maybeLegacyId: string,
) => {
  const direct = await prisma.material.findUnique({
    where: { id: maybeLegacyId },
    select: { id: true, type: true },
  })
  if (direct && direct.type === type) return direct.id

  const prefixed = `${type === MaterialType.LISTENING ? 'lesson' : type === MaterialType.MEDIA_SUBTITLE ? 'media' : type === MaterialType.READING ? 'passage' : 'quiz'}:${maybeLegacyId}`
  const legacy = await prisma.material.findUnique({
    where: { id: prefixed },
    select: { id: true, type: true },
  })
  if (legacy && legacy.type === type) return legacy.id
  return null
}

const normalizeOptions = (
  optionsInput: QuestionOptionInput[] | null | undefined,
): { text: string; isCorrect: boolean }[] => {
  const source = Array.isArray(optionsInput) ? optionsInput : []
  const normalized =
    source.length > 0
      ? source.map((opt, index) => ({
          text: (opt?.text || '').trim() || `选项 ${index + 1}`,
          isCorrect: Boolean(opt?.isCorrect),
        }))
      : [
          { text: '选项 1', isCorrect: true },
          { text: '选项 2', isCorrect: false },
          { text: '选项 3', isCorrect: false },
          { text: '选项 4', isCorrect: false },
        ]
  if (!normalized.some(option => option.isCorrect))
    normalized[0].isCorrect = true
  return normalized
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'

const scoreVocabularyCandidate = (
  normalizedWord: string,
  targetKeys: Set<string>,
  candidateWord: string,
) => {
  const candidateKeys = buildVocabularyCanonicalKeys(candidateWord)
  const intersectCount = candidateKeys.filter(key => targetKeys.has(key)).length
  if (intersectCount === 0) return -1

  const lengthScore = Math.max(
    0,
    6 - Math.abs(candidateWord.length - normalizedWord.length),
  )

  return intersectCount * 10 + lengthScore
}

const buildVocabularyCandidateTerms = (normalizedWord: string) =>
  Array.from(
    new Set(
      [normalizedWord, ...buildVocabularyCanonicalKeys(normalizedWord)]
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const findExistingVocabularyCandidate = async (normalizedWord: string) => {
  const targetKeys = new Set(buildVocabularyCanonicalKeys(normalizedWord))
  if (targetKeys.size === 0) return null

  const candidateTerms = buildVocabularyCandidateTerms(normalizedWord)
  const startsWithTerms = candidateTerms
    .filter(item => item.length >= 2)
    .slice(0, 8)

  const candidates = await prisma.vocabulary.findMany({
    where: {
      OR: [
        { word: normalizedWord },
        ...candidateTerms.map(term => ({ word: term })),
        ...startsWithTerms.map(term => ({
          word: { startsWith: term },
        })),
      ],
    },
    take: 80,
    orderBy: { createdAt: 'desc' },
  })

  let bestCandidate: (typeof candidates)[number] | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    const score = scoreVocabularyCandidate(
      normalizedWord,
      targetKeys,
      candidate.word,
    )
    if (score < 0) continue
    if (!bestCandidate || score > bestScore) {
      bestCandidate = candidate
      bestScore = score
    }
  }

  return bestCandidate
}

const normalizeSentenceKey = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s([{【（]*\d+[\]).】、．\s-]*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const upsertVocabularySentenceLink = async (
  vocabularyId: string,
  sentence: {
    text: string
    source: string
    sourceUrl: string
    translation?: string | null
    audioFile?: string | null
    sourceType?: SourceType
    sourceId?: string
    meaningIndex?: number | null
    posTags?: string[]
  },
) => {
  const text = sentence.text.trim()
  if (!text) return
  const sourceUrl = sentence.sourceUrl.trim() || '#'
  const normalizedText = normalizeSentenceKey(text)
  if (!normalizedText) return

  const sentenceRow = await prisma.vocabularySentence.upsert({
    where: {
      normalizedText_sourceUrl: {
        normalizedText,
        sourceUrl,
      },
    },
    update: {
      text,
      translation: (sentence.translation || '').trim() || null,
      audioFile: (sentence.audioFile || '').trim() || null,
      source: sentence.source.trim() || '未知来源',
      sourceType: sentence.sourceType,
      sourceId: sentence.sourceId || null,
    },
    create: {
      text,
      normalizedText,
      translation: (sentence.translation || '').trim() || null,
      audioFile: (sentence.audioFile || '').trim() || null,
      source: sentence.source.trim() || '未知来源',
      sourceUrl,
      sourceType: sentence.sourceType,
      sourceId: sentence.sourceId || null,
    },
  })

  await prisma.vocabularySentenceLink.upsert({
    where: {
      vocabularyId_sentenceId: {
        vocabularyId,
        sentenceId: sentenceRow.id,
      },
    },
    update: {
      meaningIndex:
        typeof sentence.meaningIndex === 'number'
          ? sentence.meaningIndex
          : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
    create: {
      vocabularyId,
      sentenceId: sentenceRow.id,
      meaningIndex:
        typeof sentence.meaningIndex === 'number'
          ? sentence.meaningIndex
          : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
  })
}

const findSentenceLinkByText = async (
  vocabularyId: string,
  sentenceText: string,
) => {
  const normalized = normalizeSentenceKey(sentenceText)
  if (!normalized) return null
  return prisma.vocabularySentenceLink.findFirst({
    where: {
      vocabularyId,
      sentence: {
        normalizedText: normalized,
      },
    },
    include: {
      sentence: true,
    },
  })
}

const cleanupOrphanSentence = async (sentenceId: string) => {
  const count = await prisma.vocabularySentenceLink.count({
    where: { sentenceId },
  })
  if (count === 0) {
    await prisma.vocabularySentence.delete({ where: { id: sentenceId } })
  }
}

const stripContextUiChrome = (text: string) => {
  let next = text.replace(/\s+/g, ' ').trim()
  if (!next) return next

  const leadingPatterns = [
    /^#\d+\s*/,
    /^(已收藏|收藏)\s*/,
    /^(笔记\*?|笔记)\s*/,
    /^(收起编辑|编辑)\s*/,
    /^(取消|保存笔记)\s*/,
  ]

  let changed = true
  while (changed && next) {
    changed = false
    for (const pattern of leadingPatterns) {
      const replaced = next.replace(pattern, '')
      if (replaced !== next) {
        next = replaced.trim()
        changed = true
      }
    }
  }

  return next
}

const extractSentenceContainingWord = (text: string, word: string) => {
  const normalizedText = stripContextUiChrome(text)
  const normalizedWord = word.trim()
  if (!normalizedText || !normalizedWord) return normalizedText

  const parts = normalizedText
    .split(/(?<=[。！？.!?\n])/)
    .map(item => item.trim())
    .filter(Boolean)
  if (parts.length === 0) return normalizedText

  const lowerWord = normalizedWord.toLowerCase()
  const matched =
    parts.find(part => part.toLowerCase().includes(lowerWord)) || normalizedText
  return matched.trim()
}

const resolveVocabularySourceMeta = async (
  sourceType: SourceType,
  sourceId: string,
): Promise<{ source: string; sourceUrl: string }> => {
  if (sourceType === 'AUDIO_DIALOGUE') {
    const sentence = await prisma.vocabularySentence.findFirst({
      where: { sourceType, sourceId },
      select: { source: true, sourceUrl: true },
    })
    if (sentence) {
      return {
        source: sentence.source || '听力',
        sourceUrl: sentence.sourceUrl || '#',
      }
    }
    return { source: '听力', sourceUrl: '#' }
  }

  if (sourceType === 'MEDIA_SUBTITLE_LINE') {
    const sentence = await prisma.vocabularySentence.findFirst({
      where: { sourceType, sourceId },
      select: { source: true, sourceUrl: true },
    })
    if (sentence) {
      return {
        source: sentence.source || '影视字幕',
        sourceUrl: sentence.sourceUrl || '#',
      }
    }
    return { source: '影视字幕', sourceUrl: '#' }
  }

  if (sourceType === 'ARTICLE_TEXT') {
    const materialId = await resolveMaterialIdByLegacy(
      MaterialType.READING,
      sourceId,
    )
    const material = materialId
      ? await prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, title: true },
        })
      : null
    if (material) {
      return {
        source: `阅读：${material.title}`,
        sourceUrl: `/articles/${toLegacyMaterialId(material.id)}`,
      }
    }
    return { source: '阅读', sourceUrl: '#' }
  }

  if (sourceType === 'QUIZ_QUESTION') {
    const question = await prisma.question.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        material: { select: { id: true, title: true, type: true } },
      },
    })
    if (question?.material?.type === MaterialType.VOCAB_GRAMMAR) {
      return {
        source: `题目：${question.material.title}`,
        sourceUrl: `/practice`,
      }
    }
    if (question?.material?.type === MaterialType.READING) {
      return {
        source: `阅读题目：${question.material.title}`,
        sourceUrl: `/articles/${toLegacyMaterialId(question.material.id)}`,
      }
    }
    return { source: '题目', sourceUrl: '#' }
  }

  return { source: '未知来源', sourceUrl: '#' }
}

const listVocabularySentenceRecords = async (
  vocabularyId: string,
): Promise<VocabularySentenceRecord[]> => {
  const links = await prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId },
    include: { sentence: true },
    orderBy: { createdAt: 'asc' },
  })
  return dedupeAndRankSentences(
    links.map(link => ({
      text: link.sentence.text,
      source: link.sentence.source,
      sourceUrl: link.sentence.sourceUrl,
      translation: link.sentence.translation || null,
      audioFile: link.sentence.audioFile || null,
      sourceType: link.sentence.sourceType,
      meaningIndex: link.meaningIndex ?? null,
      posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
    })),
    16,
  )
}

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
    const normalizedQuestions = (data.questions || []).map((q, index) => ({
      questionType: toSafeQuestionType(
        (q.questionType || '').trim(),
        QuestionType.READING_COMPREHENSION,
      ),
      prompt: (q.prompt || '').trim() || null,
      contextSentence:
        (q.contextSentence || '').trim() ||
        (q.prompt || '').trim() ||
        '（未填写语境句）',
      explanation: (q.explanation || '').trim(),
      order: index + 1,
      options: normalizeOptions(q.options),
    }))

    const exists = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    })
    if (!exists) {
      return { success: false, message: '所属集合不存在，请刷新后重试。' }
    }

    const nextLanguage = (data.language || '').trim()
    const nextLevel = (data.level || '').trim()
    await prisma.collection.update({
      where: { id: collectionId },
      data: {
        language: nextLanguage || null,
        level: nextLevel || null,
      },
    })

    await prisma.material.create({
      data: {
        type: MaterialType.READING,
        title: articleTitle || '未命名阅读材料',
        contentPayload: {
          text: content,
          description: (data.description || '').trim() || null,
        },
        collectionMaterials: {
          create: {
            collectionId,
            sortOrder: 0,
          },
        },
        questions: {
          create: normalizedQuestions.map(q => ({
            templateType: toTemplateType(q.questionType),
            content: toQuestionRecordPayload(
              q.questionType,
              q.prompt,
              q.contextSentence,
              null,
              q.explanation || null,
            ),
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

    const nextLanguage = (data.language || '').trim()
    const nextLevel = (data.level || '').trim()
    await prisma.collection.update({
      where: { id: data.paperId },
      data: {
        language: nextLanguage || null,
        level: nextLevel || null,
      },
    })

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
          contentPayload: { title: collection.title },
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
    const promptText = (data.prompt || '').trim()
    const contextText = (data.contextSentence || '').trim()
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
    const normalizedContext = contextText || promptText || '（未填写语境句）'

    await prisma.question.create({
      data: {
        materialId: quizMaterialId,
        templateType: toTemplateType(questionType),
        content: toQuestionRecordPayload(
          questionType,
          promptText || null,
          normalizedContext,
          (data.targetWord || '').trim() || null,
          (data.explanation || '').trim() || null,
        ),
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
    const materialId = await resolveMaterialIdByLegacy(
      MaterialType.READING,
      payload.passageId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '阅读材料不存在。' }
    }

    await prisma.$transaction(async tx => {
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))

      await tx.material.update({
        where: { id: materialId },
        data: {
          title,
          contentPayload: { text: content },
        },
      })

      const keepQuestionIds: string[] = []
      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const promptText = (question.prompt || '').trim()
        const contextText = (question.contextSentence || '').trim()
        const questionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.READING_COMPREHENSION,
        )
        const normalizedContext = contextText || promptText || '（未填写语境句）'
        const normalizedOptions = normalizeOptions(question.options)
        const nextQuestionData = {
          templateType: toTemplateType(questionType),
          content: toQuestionRecordPayload(
            questionType,
            promptText || null,
            normalizedContext,
            null,
            null,
          ),
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
    revalidatePath('/upload')
    revalidatePath('/articles')
    revalidatePath('/articles/[id]', 'page')

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
    const materialId = await resolveMaterialIdByLegacy(
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
        const promptText = (question.prompt || '').trim()
        const contextText = (question.contextSentence || '').trim()
        const rawQuestionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.PRONUNCIATION,
        )
        const questionType = normalizeQuestionTypeForMaterial(
          MaterialType.VOCAB_GRAMMAR,
          rawQuestionType,
        )
        const normalizedContext =
          contextText ||
          promptText ||
          (questionType === QuestionType.LISTENING
            ? '（听力题）'
            : '（未填写语境句）')
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
        const baseContent = toQuestionRecordPayload(
          questionType,
          promptText || null,
          normalizedContext,
          targetWord,
          explanation,
        )
        const nextQuestionData = {
          templateType: toTemplateType(questionType),
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
    })

    revalidatePath('/')
    revalidatePath('/upload')
    revalidatePath('/practice')

    return { success: true }
  } catch (error) {
    console.error('updateQuizWithQuestions failed:', error)
    return { success: false, message: '保存失败，请稍后重试。' }
  }
}

type UpdateLessonQuestionsPayload = {
  lessonId: string
  questions: EditableQuizQuestionInput[]
}

export async function updateLessonQuestions(
  payload: UpdateLessonQuestionsPayload,
) {
  try {
    if (!payload.lessonId) {
      return { success: false, message: '听力 ID 缺失。' }
    }
    const materialId = await resolveMaterialIdByLegacy(
      MaterialType.LISTENING,
      payload.lessonId.trim(),
    )
    if (!materialId) {
      return { success: false, message: '听力材料不存在。' }
    }

    await prisma.$transaction(async tx => {
      const existingQuestions = await tx.question.findMany({
        where: { materialId },
        select: { id: true },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))

      const keepQuestionIds: string[] = []

      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const promptText = (question.prompt || '').trim()
        const contextText = (question.contextSentence || '').trim()
        const questionType = toSafeQuestionType(
          (question.questionType || '').trim(),
          QuestionType.PRONUNCIATION,
        )
        const normalizedContext =
          contextText ||
          promptText ||
          (questionType === QuestionType.LISTENING
            ? '（听力题）'
            : '（未填写语境句）')
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
        const baseContent = toQuestionRecordPayload(
          questionType,
          promptText || null,
          normalizedContext,
          targetWord,
          explanation,
        )
        const nextQuestionData = {
          templateType: toTemplateType(questionType),
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
    })

    revalidatePath('/')
    revalidatePath('/upload')
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
        : requestedType === CollectionType.FAVORITES
          ? CollectionType.FAVORITES
          : CollectionType.PAPER
    const typeLabel =
      collectionType === CollectionType.PAPER
        ? '试卷'
        : collectionType === CollectionType.CUSTOM_GROUP
          ? '分组'
          : '收藏夹'

    const newCategory = await prisma.collection.create({
      data: {
        title,
        collectionType,
      },
      select: { id: true, title: true, collectionType: true },
    })

    return {
      success: true,
      paper: {
        id: newCategory.id,
        name: newCategory.title,
        collectionType: newCategory.collectionType,
        level: { title: typeLabel },
      },
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '新建集合失败，请检查控制台。' }
  }
}

export async function saveVocabulary(
  word: string,
  contextSentence: string,
  sourceType: SourceType,
  sourceId: string,
  pronunciation?: string,
  pronunciations?: string[],
  meanings?: string[],
  partOfSpeech?: string,
  partsOfSpeech?: string[],
) {
  try {
    const trimmedWord = word.trim()
    if (!trimmedWord) return { success: false, message: '单词为空' }
    const normalizedContextSentence = extractSentenceContainingWord(
      contextSentence,
      trimmedWord,
    )
    const sourceMeta = await resolveVocabularySourceMeta(sourceType, sourceId)

    const normalizedPronunciations = sanitizePronunciations(
      trimmedWord,
      pronunciations || [],
    )
    const normalizedPrimaryPronunciation = sanitizePronunciation(
      trimmedWord,
      pronunciation || '',
    )
    const normalizedPartsOfSpeech = Array.from(
      new Set(
        [partOfSpeech || '', ...(partsOfSpeech || [])]
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )
    const normalizedWord = normalizeVocabularyHeadword(
      trimmedWord,
      normalizedPartsOfSpeech,
    )
    const normalizedMeanings = Array.from(
      new Set((meanings || []).map(item => item.trim()).filter(Boolean)),
    )

    let exists = await prisma.vocabulary.findFirst({
      where: { word: normalizedWord },
    })

    if (!exists) {
      exists = await findExistingVocabularyCandidate(normalizedWord)
    }

    if (exists) {
      const mergedPronunciations = toJsonStringList([
        normalizedPrimaryPronunciation,
        ...normalizedPronunciations,
        ...sanitizePronunciations(
          trimmedWord,
          parseJsonStringList(exists.pronunciations),
        ),
      ])
      const mergedMeanings = toJsonStringList([
        ...normalizedMeanings,
        ...parseJsonStringList(exists.meanings),
      ])
      const mergedPartsOfSpeech = toJsonStringList([
        ...normalizedPartsOfSpeech,
        ...parseJsonStringList(exists.partsOfSpeech),
      ])
      const newSentence: VocabularySentenceRecord | null =
        normalizedContextSentence
          ? {
              text: normalizedContextSentence,
              source: sourceMeta.source,
              sourceUrl: sourceMeta.sourceUrl,
              meaningIndex: null,
              posTags: normalizeSentencePosTags(normalizedPartsOfSpeech),
            }
          : null
      const existedLink = newSentence
        ? await findSentenceLinkByText(exists.id, newSentence.text)
        : null

      await prisma.vocabulary.update({
        where: { id: exists.id },
        data: {
          pronunciations: mergedPronunciations,
          partsOfSpeech: mergedPartsOfSpeech,
          meanings: mergedMeanings,
        },
      })
      if (newSentence && !existedLink) {
        await upsertVocabularySentenceLink(exists.id, {
          text: newSentence.text,
          source: newSentence.source,
          sourceUrl: newSentence.sourceUrl,
          sourceType,
          sourceId,
          meaningIndex: null,
          posTags: newSentence.posTags || [],
        })
      }

      if (newSentence && !existedLink) {
        return {
          success: false,
          state: 'already_exists',
          message: '已在生词本中，已追加例句',
        }
      }
      return {
        success: false,
        state: 'already_exists',
        message: '已在生词本中',
      }
    }

    const created = await prisma.vocabulary.create({
      data: {
        word: normalizedWord,
        sourceType: sourceType,
        sourceId: sourceId,
        pronunciations: toJsonStringList([
          normalizedPrimaryPronunciation,
          ...normalizedPronunciations,
        ]),
        partsOfSpeech: toJsonStringList(normalizedPartsOfSpeech),
        meanings: toJsonStringList(normalizedMeanings),
      },
    })
    if (normalizedContextSentence) {
      await upsertVocabularySentenceLink(created.id, {
        text: normalizedContextSentence,
        source: sourceMeta.source,
        sourceUrl: sourceMeta.sourceUrl,
        sourceType,
        sourceId,
        meaningIndex: null,
        posTags: normalizeSentencePosTags(normalizedPartsOfSpeech),
      })
    }

    return { success: true, state: 'success', message: '已收藏至生词本' }
  } catch (error) {
    console.error(error)
    return { success: false, state: 'error', message: '保存失败' }
  }
}

export async function updateVocabularyPronunciationById(
  id: string,
  pronunciation: string,
) {
  try {
    const target = await prisma.vocabulary.findUnique({
      where: { id },
      select: { word: true },
    })
    if (!target) return { success: false }
    const nextPron = sanitizePronunciation(target.word, pronunciation)
    await prisma.vocabulary.update({
      where: { id },
      data: {
        pronunciations: toJsonStringList(nextPron ? [nextPron] : []),
      },
    })
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}

export async function updateVocabularyPartsOfSpeechById(
  id: string,
  partsOfSpeech: string[],
) {
  try {
    const normalized = Array.from(
      new Set(partsOfSpeech.map(item => item.trim()).filter(Boolean)),
    )
    await prisma.vocabulary.update({
      where: { id },
      data: {
        partsOfSpeech: toJsonStringList(normalized),
      },
    })
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '词性保存失败' }
  }
}

const isWordbookMoveValid = async (
  wordbookId: string,
  nextParentId: string | null,
) => {
  if (!nextParentId) return true
  if (nextParentId === wordbookId) return false

  let cursor: string | null = nextParentId
  while (cursor) {
    if (cursor === wordbookId) return false
    const parent: { parentId: string | null } | null = await prisma.wordbook.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
    cursor = parent?.parentId || null
  }
  return true
}

export async function createWordbook(
  title: string,
  parentId?: string | null,
) {
  try {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return { success: false, message: '单词书名称不能为空' }
    }
    const nextParentId = parentId?.trim() || null
    if (nextParentId) {
      const parent = await prisma.wordbook.findUnique({
        where: { id: nextParentId },
        select: { id: true },
      })
      if (!parent) {
        return { success: false, message: '上级单词书不存在' }
      }
    }
    const wordbook = await prisma.wordbook.create({
      data: {
        title: trimmedTitle,
        parentId: nextParentId,
      },
      select: { id: true, title: true, parentId: true, createdAt: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return {
      success: true,
      wordbook: {
        id: wordbook.id,
        title: wordbook.title,
        parentId: wordbook.parentId,
        createdAt: wordbook.createdAt,
      },
    }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同级单词书名称已存在' }
    }
    console.error(error)
    return { success: false, message: '创建单词书失败' }
  }
}

export async function renameWordbook(wordbookId: string, title: string) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    const trimmedTitle = title.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    if (!trimmedTitle) return { success: false, message: '名称不能为空' }
    const updated = await prisma.wordbook.update({
      where: { id: trimmedWordbookId },
      data: { title: trimmedTitle },
      select: { id: true, title: true, parentId: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return { success: true, wordbook: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同级单词书名称已存在' }
    }
    console.error(error)
    return { success: false, message: '重命名失败' }
  }
}

export async function moveWordbook(
  wordbookId: string,
  parentId: string | null,
) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    const nextParentId = parentId?.trim() || null
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const wordbook = await prisma.wordbook.findUnique({
      where: { id: trimmedWordbookId },
      select: { id: true },
    })
    if (!wordbook) return { success: false, message: '单词书不存在' }
    if (nextParentId) {
      const target = await prisma.wordbook.findUnique({
        where: { id: nextParentId },
        select: { id: true },
      })
      if (!target) return { success: false, message: '目标单词书不存在' }
    }
    const valid = await isWordbookMoveValid(trimmedWordbookId, nextParentId)
    if (!valid) return { success: false, message: '不能移动到自身或子单词书下' }
    const updated = await prisma.wordbook.update({
      where: { id: trimmedWordbookId },
      data: { parentId: nextParentId },
      select: { id: true, title: true, parentId: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return { success: true, wordbook: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '目标位置已有同名单词书' }
    }
    console.error(error)
    return { success: false, message: '移动单词书失败' }
  }
}

export async function deleteWordbook(wordbookId: string) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const existing = await prisma.wordbook.findUnique({
      where: { id: trimmedWordbookId },
      select: { id: true },
    })
    if (!existing) return { success: false, message: '单词书不存在' }

    await prisma.wordbook.delete({
      where: { id: trimmedWordbookId },
    })
    revalidatePath('/wordbooks')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除单词书失败' }
  }
}

export async function renameVocabularyGroup(
  fromGroup: string,
  toGroup: string,
) {
  try {
    const from = fromGroup.trim()
    const to = toGroup.trim()
    if (!from) return { success: false, message: '原分组无效' }
    if (!to) return { success: false, message: '新分组名称不能为空' }
    if (from === to) return { success: true, changed: 0 }
    const result = await prisma.vocabulary.updateMany({
      where: { groupName: from },
      data: { groupName: to },
    })
    revalidatePath('/vocabulary')
    return { success: true, changed: result.count }
  } catch (error) {
    console.error(error)
    return { success: false, message: '重命名分组失败' }
  }
}

export async function addVocabularyToWordbook(
  vocabularyId: string,
  wordbookId: string,
) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) {
      return { success: false, message: '单词书无效' }
    }
    await prisma.wordbookVocabulary.upsert({
      where: {
        wordbookId_vocabularyId: {
          wordbookId: trimmedWordbookId,
          vocabularyId,
        },
      },
      update: {},
      create: {
        wordbookId: trimmedWordbookId,
        vocabularyId,
      },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '加入单词书失败' }
  }
}

export async function removeVocabularyFromWordbook(
  vocabularyId: string,
  wordbookId: string,
) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) {
      return { success: false, message: '单词书无效' }
    }
    await prisma.wordbookVocabulary.deleteMany({
      where: {
        vocabularyId,
        wordbookId: trimmedWordbookId,
      },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '移出单词书失败' }
  }
}

export async function listWordbooksTree() {
  const rows = await prisma.wordbook.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      parentId: true,
      _count: {
        select: { entries: true },
      },
    },
  })
  return rows.map(item => ({
    id: item.id,
    title: item.title,
    parentId: item.parentId,
    vocabularyCount: item._count.entries,
  }))
}

export async function listVocabularyByWordbook(
  wordbookId: string,
  page = 1,
  pageSize = 48,
) {
  const normalizedPage = Math.max(1, Math.floor(page || 1))
  const normalizedPageSize = Math.max(
    1,
    Math.min(100, Math.floor(pageSize || 48)),
  )

  const [totalCount, rows] = await Promise.all([
    prisma.wordbookVocabulary.count({
      where: { wordbookId },
    }),
    prisma.wordbookVocabulary.findMany({
      where: { wordbookId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (normalizedPage - 1) * normalizedPageSize,
      take: normalizedPageSize,
      include: {
        vocabulary: {
          include: {
            review: {
              select: {
                id: true,
                due: true,
                state: true,
                stability: true,
                difficulty: true,
                elapsed_days: true,
                scheduled_days: true,
                reps: true,
                lapses: true,
                learning_steps: true,
                last_review: true,
              },
            },
            tags: {
              include: {
                tag: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize))
  return {
    totalCount,
    totalPages,
    currentPage: Math.min(normalizedPage, totalPages),
    items: rows.map(item => item.vocabulary),
  }
}

export async function syncAnkiSentenceSourcesForWordbook(wordbookId: string) {
  const trimmedWordbookId = (wordbookId || '').trim()
  if (!trimmedWordbookId) return { success: false, updatedCount: 0 }

  const wordbook = await prisma.wordbook.findUnique({
    where: { id: trimmedWordbookId },
    select: { id: true, title: true },
  })
  if (!wordbook) return { success: false, updatedCount: 0 }

  const wordbookLinks = await prisma.wordbookVocabulary.findMany({
    where: { wordbookId: trimmedWordbookId },
    select: { vocabularyId: true },
  })
  const vocabularyIds = Array.from(
    new Set(wordbookLinks.map(item => item.vocabularyId).filter(Boolean)),
  )
  if (vocabularyIds.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const sentenceLinks = await prisma.vocabularySentenceLink.findMany({
    where: {
      vocabularyId: { in: vocabularyIds },
      sentence: {
        OR: [
          { sourceId: 'anki-import' },
          { sourceUrl: '/anki' },
          { sourceUrl: '/manage/import/anki' },
        ],
      },
    },
    select: { sentenceId: true },
  })
  const sentenceIds = Array.from(
    new Set(sentenceLinks.map(item => item.sentenceId).filter(Boolean)),
  )
  if (sentenceIds.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const updated = await prisma.vocabularySentence.updateMany({
    where: {
      id: { in: sentenceIds },
      AND: [
        {
          OR: [
            { sourceId: 'anki-import' },
            { sourceUrl: '/anki' },
            { sourceUrl: '/manage/import/anki' },
          ],
        },
        {
          OR: [
            { source: { not: wordbook.title } },
            { sourceUrl: { not: '/anki' } },
          ],
        },
      ],
    },
    data: {
      source: wordbook.title,
      sourceUrl: '/anki',
    },
  })

  return { success: true, updatedCount: updated.count }
}

export async function searchVocabularyCandidates(
  keyword: string,
  wordbookId?: string,
  limit = 20,
) {
  const trimmed = keyword.trim()
  if (!trimmed) return []
  const maxLimit = Math.max(1, Math.min(50, Math.floor(limit || 20)))
  const rows = await prisma.vocabulary.findMany({
    where: {
      word: { contains: trimmed, mode: 'insensitive' },
      ...(wordbookId
        ? {
            wordbooks: {
              none: {
                wordbookId,
              },
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: maxLimit,
    select: {
      id: true,
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
    },
  })
  return rows.map(item => ({
    id: item.id,
    word: item.word,
    pronunciations: parseJsonStringList(item.pronunciations),
    partsOfSpeech: parseJsonStringList(item.partsOfSpeech),
  }))
}

export async function addVocabulariesToWordbook(
  vocabularyIds: string[],
  wordbookId: string,
) {
  try {
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const uniqueIds = Array.from(
      new Set(vocabularyIds.map(item => item.trim()).filter(Boolean)),
    )
    if (uniqueIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }

    const existingWordbook = await prisma.wordbook.findUnique({
      where: { id: trimmedWordbookId },
      select: { id: true },
    })
    if (!existingWordbook) return { success: false, message: '单词书不存在' }

    const result = await prisma.wordbookVocabulary.createMany({
      data: uniqueIds.map(vocabularyId => ({
        wordbookId: trimmedWordbookId,
        vocabularyId,
      })),
      skipDuplicates: true,
    })
    revalidatePath('/vocabulary')
    revalidatePath('/wordbooks')
    return {
      success: true,
      added: result.count,
      total: uniqueIds.length,
      skipped: Math.max(0, uniqueIds.length - result.count),
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '批量加入单词书失败' }
  }
}

export async function deleteArticle(passageId: string) {
  try {
    const materialId = await resolveMaterialIdByLegacy(
      MaterialType.READING,
      passageId.trim(),
    )
    if (!materialId) {
      return { success: true, message: '文章已移除' }
    }

    const result = await prisma.material.deleteMany({
      where: { id: materialId, type: MaterialType.READING },
    })

    if (result.count === 0) {
      console.warn(`尝试删除不存在的文章 ID: ${passageId}`)
      return { success: true, message: '文章已移除' }
    }

    return { success: true, message: '删除成功' }
  } catch (error: unknown) {
    console.error('删除文章时发生未知错误:', getErrorMessage(error), error)
    return { success: false, message: '服务器内部错误，删除失败' }
  }
}

export async function submitQuizAttempts(
  attempts: {
    questionId: string
    isCorrect: boolean
    timeSpentMs: number
  }[],
) {
  try {
    await prisma.$transaction(async tx => {
      await tx.questionAttempt.createMany({
        data: attempts,
      })

      const now = new Date()
      const firstRetryDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const wrongAttempts = attempts.filter(item => !item.isCorrect)

      for (const item of wrongAttempts) {
        await tx.questionRetry.upsert({
          where: { questionId: item.questionId },
          create: {
            questionId: item.questionId,
            stage: 0,
            dueAt: firstRetryDueAt,
            wrongCount: 1,
          },
          update: {
            stage: 0,
            dueAt: firstRetryDueAt,
            wrongCount: { increment: 1 },
          },
        })
      }
    })

    revalidatePath('/review')
    revalidatePath('/practice')
    revalidatePath('/today')
    revalidatePath('/')

    return { success: true, message: '做题数据已永久保存入库！' }
  } catch (error: unknown) {
    console.error('保存做题数据失败:', getErrorMessage(error), error)
    return { success: false, message: '数据保存失败' }
  }
}

export async function updateQuestionExplanation(
  questionId: string,
  explanation: string,
) {
  try {
    await prisma.question.update({
      where: { id: questionId },
      data: { analysis: explanation },
    })
    return { success: true, message: '笔记已保存' }
  } catch (error: unknown) {
    console.error('保存笔记失败:', getErrorMessage(error), error)
    return { success: false, message: '保存失败' }
  }
}

export async function updateQuestionNote(questionId: string, note: string) {
  try {
    const normalizedQuestionId = (questionId || '').trim()
    if (!normalizedQuestionId) {
      return { success: false, message: '题目不存在' }
    }
    const normalizedNote = (note || '').trim()
    await prisma.question.update({
      where: { id: normalizedQuestionId },
      data: { note: normalizedNote || null },
    })
    return { success: true, message: '笔记已保存' }
  } catch (error: unknown) {
    console.error('保存题目笔记失败:', getErrorMessage(error), error)
    return { success: false, message: '保存失败' }
  }
}

export async function deleteVocabulary(id: string) {
  try {
    await prisma.vocabulary.delete({ where: { id } })
    return { success: true, message: '删除成功' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除失败' }
  }
}

export async function searchSentencesForWord(word: string) {
  try {
    const articles = await prisma.material.findMany({
      where: { type: MaterialType.READING },
      select: { id: true, title: true, contentPayload: true },
    })

    const questions = await prisma.question.findMany({
      where: {
        OR: [
          { prompt: { contains: word } },
          { context: { contains: word } },
        ],
      },
      select: {
        id: true,
        prompt: true,
        context: true,
        material: { select: { id: true, title: true, type: true } },
      },
    })

    const results: {
      text: string
      source: string
      sourceUrl: string
      sourceType?: SourceType
    }[] = []
    articles.forEach(a => {
      const payload =
        a.contentPayload && typeof a.contentPayload === 'object'
          ? (a.contentPayload as Record<string, unknown>)
          : {}
      const articleText = String(payload.text || payload.transcript || '')
      const parts = articleText.match(/[^。！？.!\?\n]+[。！？.!\?\n]*/g) || [
        articleText,
      ]
      parts.forEach(p => {
        const t = p.trim()
        if (t.includes(word) && t.length > 5) {
          results.push({
            text: t,
            source: `阅读：${a.title}`,
            sourceUrl: `/articles/${toLegacyMaterialId(a.id)}`,
            sourceType: 'ARTICLE_TEXT',
          })
        }
      })
    })

    questions.forEach(q => {
      const t = (q.context || q.prompt || '').trim()
      if (t.includes(word) && t.length > 5) {
        results.push({
          text: t,
          source: `题目：${q.material?.title || '练习题'}`,
          sourceUrl: `/practice`,
          sourceType: 'QUIZ_QUESTION',
        })
      }
    })

    return { success: true, data: dedupeAndRankSentences(results, 12) }
  } catch {
    return { success: false, data: [] }
  }
}

export async function addVocabularySentence(
  id: string,
  newSentenceObj: { text: string; source: string; sourceUrl: string },
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const normalizedSentence: VocabularySentenceRecord = {
      text: newSentenceObj.text.trim(),
      source: newSentenceObj.source.trim() || '未知来源',
      sourceUrl: newSentenceObj.sourceUrl.trim() || '#',
      meaningIndex: null,
      posTags: [],
    }
    if (!normalizedSentence.text) {
      return { success: false, message: '例句为空' }
    }
    const existed = await findSentenceLinkByText(id, normalizedSentence.text)
    if (existed) {
      return {
        success: true,
        message: '例句已存在',
        sentences: await listVocabularySentenceRecords(id),
      }
    }
    await upsertVocabularySentenceLink(id, {
      text: normalizedSentence.text,
      source: normalizedSentence.source,
      sourceUrl: normalizedSentence.sourceUrl,
      meaningIndex: null,
      posTags: [],
    })
    return {
      success: true,
      message: '例句已添加',
      sentences: await listVocabularySentenceRecords(id),
    }
  } catch {
    return { success: false, message: '添加失败' }
  }
}

export async function assignVocabularySentenceMeaning(
  id: string,
  sentenceText: string,
  meaningIndex: number,
) {
  try {
    if (!sentenceText.trim()) {
      return { success: false, message: '句子不能为空' }
    }
    if (!Number.isInteger(meaningIndex) || meaningIndex < 0) {
      return { success: false, message: '释义索引不合法' }
    }

    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (!link) {
      return { success: false, message: '未找到该例句' }
    }
    await prisma.vocabularySentenceLink.update({
      where: { id: link.id },
      data: { meaningIndex },
    })
    revalidatePath('/vocabulary')
    return { success: true, message: '释义匹配已保存' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '保存失败' }
  }
}

export async function clearVocabularySentenceMeaning(
  id: string,
  sentenceText: string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }
    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.vocabularySentenceLink.update({
        where: { id: link.id },
        data: { meaningIndex: null },
      })
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '取消匹配失败' }
  }
}

export async function updateVocabularySentence(
  id: string,
  oldSentenceText: string,
  nextSentence: { text: string; source: string; sourceUrl: string },
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const nextText = nextSentence.text.trim()
    if (!nextText) return { success: false, message: '句子不能为空' }

    const source = nextSentence.source.trim() || '未知来源'
    const sourceUrl = nextSentence.sourceUrl.trim() || '#'
    const oldText = oldSentenceText.trim()
    const link = await findSentenceLinkByText(id, oldText)
    if (!link) return { success: false, message: '未找到该句子' }
    const duplicated = await findSentenceLinkByText(id, nextText)
    if (duplicated && duplicated.id !== link.id) {
      return { success: false, message: '已存在相同句子' }
    }

    await upsertVocabularySentenceLink(id, {
      text: nextText,
      source,
      sourceUrl,
      sourceType: link.sentence.sourceType || undefined,
      sourceId: link.sentence.sourceId || undefined,
      meaningIndex: link.meaningIndex,
      posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
    })
    await prisma.vocabularySentenceLink.delete({ where: { id: link.id } })
    await cleanupOrphanSentence(link.sentenceId)
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '句子更新失败' }
  }
}

export async function updateVocabularySentencePosTags(
  id: string,
  sentenceText: string,
  posTags: string[] | string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const targetText = sentenceText.trim()
    const normalized = normalizeSentencePosTags(
      Array.isArray(posTags) ? posTags : [posTags],
    )
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.$transaction(async tx => {
        await tx.vocabularySentenceLink.update({
          where: { id: link.id },
          data: { posTags: toJsonStringList(normalized) },
        })
        if (normalized.length > 0) {
          const merged = Array.from(
            new Set([
              ...parseJsonStringList(vocab.partsOfSpeech),
              ...normalized,
            ]),
          )
          await tx.vocabulary.update({
            where: { id },
            data: {
              partsOfSpeech: toJsonStringList(merged),
            },
          })
        }
      })
    } else {
      return { success: false, message: '未找到该句子' }
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '句子词性更新失败' }
  }
}

export async function deleteVocabularySentence(
  id: string,
  sentenceText: string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }
    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.vocabularySentenceLink.delete({ where: { id: link.id } })
      await cleanupOrphanSentence(link.sentenceId)
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '句子删除失败' }
  }
}

export async function updateVocabularyTags(
  vocabId: string,
  tagNames: string[],
) {
  try {
    if (!vocabId) {
      return { success: false, message: '缺少词汇 ID' }
    }

    const normalizedTags = Array.from(
      new Set(tagNames.map(tag => tag.trim()).filter(Boolean)),
    )

    await prisma.$transaction(async tx => {
      await tx.vocabularyTagOnVocabulary.deleteMany({
        where: { vocabularyId: vocabId },
      })

      if (normalizedTags.length === 0) return

      await Promise.all(
        normalizedTags.map(name =>
          tx.vocabularyTag.upsert({
            where: { name },
            update: {},
            create: { name },
          }),
        ),
      )

      const tags = await tx.vocabularyTag.findMany({
        where: {
          name: { in: normalizedTags },
        },
        select: { id: true },
      })

      if (tags.length === 0) return

      await tx.vocabularyTagOnVocabulary.createMany({
        data: tags.map(tag => ({
          vocabularyId: vocabId,
          tagId: tag.id,
        })),
        skipDuplicates: true,
      })
    })

    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error('updateVocabularyTags error:', error)
    return { success: false, message: '标签保存失败' }
  }
}

export async function moveVocabularyToGroup(id: string, newGroupName: string) {
  try {
    await prisma.vocabulary.update({
      where: { id },
      data: { groupName: newGroupName },
    })
    return { success: true, message: '移动成功' }
  } catch {
    return { success: false, message: '移动失败' }
  }
}

export async function deleteQuiz(quizId: string) {
  try {
    const materialId = await resolveMaterialIdByLegacy(
      MaterialType.VOCAB_GRAMMAR,
      quizId.trim(),
    )
    if (!materialId) {
      return { success: true, message: '题库已不存在' }
    }

    const result = await prisma.material.deleteMany({
      where: { id: materialId, type: MaterialType.VOCAB_GRAMMAR },
    })

    if (result.count === 0) {
      return { success: true, message: '题库已不存在' }
    }

    return { success: true, message: '题库删除成功' }
  } catch (error) {
    console.error('删除题库失败:', error)
    return { success: false, message: '服务器错误，删除失败' }
  }
}

export type SortableModel =
  | 'Papers'
  | 'Lesson'
  | 'Passage'
  | 'Quiz'
  | 'Question'
  | 'Level'

export async function updateSortOrder(
  model: SortableModel,
  orderedIds: string[],
) {
  try {
    const updatePromises = orderedIds.map((id, index) => {
      if (model === 'Question') {
        return prisma.question.update({
          where: { id },
          data: { sortOrder: index },
        })
      }
      if (model === 'Lesson' || model === 'Passage' || model === 'Quiz') {
        return prisma.collectionMaterial.updateMany({
          where: {
            OR: [
              { materialId: id },
              { materialId: `${model === 'Lesson' ? 'lesson' : model === 'Passage' ? 'passage' : 'quiz'}:${id}` },
            ],
          },
          data: { sortOrder: index },
        })
      }
      return prisma.collectionMaterial.updateMany({
        where: { materialId: id },
        data: { sortOrder: index },
      })
    })

    await prisma.$transaction(updatePromises)

    // Keep manage/public pages in sync after drag-sort persistence.
    revalidatePath('/')
    revalidatePath('/upload')
    revalidatePath('/shadowing/[id]', 'page')
    revalidatePath('/lessons/[id]', 'page')
    revalidatePath('/articles')
    revalidatePath('/practice')

    return { success: true }
  } catch (error) {
    console.error(`更新 ${model} 排序失败:`, error)
    return { success: false, error: '排序更新失败' }
  }
}
