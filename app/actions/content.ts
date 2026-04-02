// app/actions/content.ts
'use server'

import { QuestionType, SourceType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { parseJsonStringList, toJsonStringList } from '@/utils/jsonList'
import {
  buildVocabularyCanonicalKeys,
  normalizeVocabularyHeadword,
} from '@/utils/vocabularyCanonical'
import { dedupeAndRankSentences } from '@/utils/sentenceQuality'
import { sanitizePronunciation, sanitizePronunciations } from '@/utils/pronunciation'

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(new Set((list || []).map(item => item.trim()).filter(Boolean))).slice(
    0,
    1,
  )

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
        typeof sentence.meaningIndex === 'number' ? sentence.meaningIndex : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
    create: {
      vocabularyId,
      sentenceId: sentenceRow.id,
      meaningIndex:
        typeof sentence.meaningIndex === 'number' ? sentence.meaningIndex : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
  })
}

const findSentenceLinkByText = async (vocabularyId: string, sentenceText: string) => {
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

const extractSentenceContainingWord = (text: string, word: string) => {
  const normalizedText = text.trim()
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
    const dialogueId = Number(sourceId)
    if (Number.isInteger(dialogueId) && dialogueId > 0) {
      const dialogue = await prisma.dialogue.findUnique({
        where: { id: dialogueId },
        select: { lessonId: true, lesson: { select: { title: true } } },
      })
      if (dialogue) {
        return {
          source: `🎧 听力：${dialogue.lesson.title}`,
          sourceUrl: `/lessons/${dialogue.lessonId}`,
        }
      }
    }
    return { source: '🎧 听力', sourceUrl: '#' }
  }

  if (sourceType === 'ARTICLE_TEXT') {
    const article = await prisma.article.findUnique({
      where: { id: sourceId },
      select: { id: true, title: true },
    })
    if (article) {
      return {
        source: `📄 阅读：${article.title}`,
        sourceUrl: `/articles/${article.id}`,
      }
    }
    return { source: '📄 阅读', sourceUrl: '#' }
  }

  if (sourceType === 'QUIZ_QUESTION') {
    const question = await prisma.question.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        quizId: true,
        articleId: true,
        quiz: { select: { title: true } },
        article: { select: { title: true } },
      },
    })
    if (question?.quizId && question.quiz) {
      return {
        source: `📝 题目：${question.quiz.title}`,
        sourceUrl: `/quizzes/${question.quizId}`,
      }
    }
    if (question?.articleId && question.article) {
      return {
        source: `📄 阅读题目：${question.article.title}`,
        sourceUrl: `/articles/${question.articleId}`,
      }
    }
    return { source: '📝 题目', sourceUrl: '#' }
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

export async function createArticle(data: any) {
  try {
    const articleTitle = (data.title || '').trim()

    await prisma.article.create({
      data: {
        title: articleTitle,
        content: data.content,
        categoryId: data.categoryId,
        description: data.description,

        questions: {
          // 以数组顺序生成题号，保证前端展示顺序稳定
          create:
            data.questions?.map((q: any, index: number) => ({
              questionType: q.questionType || 'READING_COMPREHENSION',
              prompt: (q.prompt || '').trim() || null,
              contextSentence:
                (q.contextSentence || '').trim() ||
                (q.prompt || '').trim() ||
                '（未填写语境句）',
              explanation: q.explanation || '',
              order: index + 1,
              options: {
                create: q.options,
              },
            })) || [],
        },
      },
    })
    return { success: true, message: '文章及相关题目发布成功！' }
  } catch (error: any) {
    console.error(error)
    return { success: false, message: '发布失败' }
  }
}

export async function createQuizQuestion(data: any) {
  try {
    if (!data.categoryId) return { success: false, message: '请选择所属试卷！' }

    // 查找或创建该分类下的题库
    let quiz = await prisma.quiz.findFirst({
      where: { categoryId: data.categoryId },
    })

    if (!quiz) {
      const cat = await prisma.category.findUnique({
        where: { id: data.categoryId },
      })
      quiz = await prisma.quiz.create({
        data: {
          title: `${cat?.name} - 综合题库`,
          categoryId: data.categoryId,
        },
      })
    }

    const maxOrder = await prisma.question.aggregate({
      where: { quizId: quiz.id },
      _max: { order: true },
    })
    const nextOrder = (maxOrder._max.order || 0) + 1
    const promptText = (data.prompt || '').trim()
    const contextText = (data.contextSentence || '').trim()
    if (!promptText && !contextText) {
      return {
        success: false,
        message:
          '未检测到题目内容。请填写“题目呈现”或“语境句”，或使用快速粘贴自动解析。',
      }
    }
    const optionsInput = Array.isArray(data.options) ? data.options : []
    const normalizedOptions =
      optionsInput.length > 0
        ? optionsInput.map((opt: any, index: number) => ({
            text: (opt?.text || '').trim() || `选项 ${index + 1}`,
            isCorrect: Boolean(opt?.isCorrect),
          }))
        : [
            { text: '选项 1', isCorrect: true },
            { text: '选项 2', isCorrect: false },
            { text: '选项 3', isCorrect: false },
            { text: '选项 4', isCorrect: false },
          ]

    await prisma.question.create({
      data: {
        quizId: quiz.id,
        questionType: data.questionType || 'PRONUNCIATION',
        contextSentence: contextText || promptText || '（未填写语境句）',
        targetWord: data.targetWord,
        prompt: promptText || null,
        explanation: data.explanation,
        order: nextOrder,
        options: {
          create: normalizedOptions.map((opt: any) => ({
            text: opt.text,
            isCorrect: opt.isCorrect,
          })),
        },
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
  articleId: string
  title: string
  content: string
  questions: EditableArticleQuestionInput[]
}

export async function updateArticleWithQuestions(payload: UpdateArticlePayload) {
  try {
    const title = payload.title.trim()
    const content = payload.content.trim()
    if (!payload.articleId) {
      return { success: false, message: '文章 ID 缺失。' }
    }
    if (!content) {
      return { success: false, message: '请填写文章正文。' }
    }

    await prisma.$transaction(async tx => {
      const existingQuestions = await tx.question.findMany({
        where: { articleId: payload.articleId },
        include: { options: { select: { id: true } } },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))
      const existingOptionIdsByQuestion = new Map(
        existingQuestions.map(q => [q.id, new Set(q.options.map(o => o.id))]),
      )

      await tx.article.update({
        where: { id: payload.articleId },
        data: { title, content },
      })

      const keepQuestionIds: string[] = []

      for (let index = 0; index < payload.questions.length; index++) {
        const question = payload.questions[index]
        const promptText = (question.prompt || '').trim()
        const contextText = (question.contextSentence || '').trim()
        const questionType = (question.questionType ||
          'READING_COMPREHENSION') as QuestionType
        const normalizedContext = contextText || promptText || '（未填写语境句）'

        const rawOptions = Array.isArray(question.options) ? question.options : []
        const normalizedOptions =
          rawOptions.length > 0
            ? rawOptions.map((option, optionIndex) => ({
                id: option.id,
                text: (option.text || '').trim() || `选项 ${optionIndex + 1}`,
                isCorrect: Boolean(option.isCorrect),
              }))
            : [
                { id: '', text: '选项 1', isCorrect: true },
                { id: '', text: '选项 2', isCorrect: false },
              ]

        if (!normalizedOptions.some(option => option.isCorrect)) {
          normalizedOptions[0].isCorrect = true
        }

        const incomingQuestionId = (question.id || '').trim()
        if (incomingQuestionId && existingQuestionIdSet.has(incomingQuestionId)) {
          keepQuestionIds.push(incomingQuestionId)

          await tx.question.update({
            where: { id: incomingQuestionId },
            data: {
              questionType,
              prompt: promptText || null,
              contextSentence: normalizedContext,
              order: index + 1,
            },
          })

          const existingOptionIdSet =
            existingOptionIdsByQuestion.get(incomingQuestionId) || new Set<string>()
          const keepOptionIds: string[] = []

          for (const option of normalizedOptions) {
            const optionId = (option.id || '').trim()
            if (optionId && existingOptionIdSet.has(optionId)) {
              keepOptionIds.push(optionId)
              await tx.questionOption.update({
                where: { id: optionId },
                data: { text: option.text, isCorrect: option.isCorrect },
              })
            } else {
              const createdOption = await tx.questionOption.create({
                data: {
                  questionId: incomingQuestionId,
                  text: option.text,
                  isCorrect: option.isCorrect,
                },
                select: { id: true },
              })
              keepOptionIds.push(createdOption.id)
            }
          }

          await tx.questionOption.deleteMany({
            where: {
              questionId: incomingQuestionId,
              id: { notIn: keepOptionIds },
            },
          })
        } else {
          const createdQuestion = await tx.question.create({
            data: {
              articleId: payload.articleId,
              questionType,
              prompt: promptText || null,
              contextSentence: normalizedContext,
              order: index + 1,
              options: {
                create: normalizedOptions.map(option => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            },
            select: { id: true },
          })
          keepQuestionIds.push(createdQuestion.id)
        }
      }

      await tx.question.deleteMany({
        where: {
          articleId: payload.articleId,
          id: { notIn: keepQuestionIds },
        },
      })
    })

    revalidatePath('/manage')
    revalidatePath('/manage/level/article/[id]', 'page')
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

    await prisma.$transaction(async tx => {
      const existingQuestions = await tx.question.findMany({
        where: { quizId: payload.quizId },
        include: { options: { select: { id: true } } },
      })
      const existingQuestionIdSet = new Set(existingQuestions.map(q => q.id))
      const existingOptionIdsByQuestion = new Map(
        existingQuestions.map(q => [q.id, new Set(q.options.map(o => o.id))]),
      )

      await tx.quiz.update({
        where: { id: payload.quizId },
        data: { title },
      })

      const keepQuestionIds: string[] = []

      for (let index = 0; index < payload.questions.length; index += 1) {
        const question = payload.questions[index]
        const promptText = (question.prompt || '').trim()
        const contextText = (question.contextSentence || '').trim()
        const questionType = (question.questionType || 'PRONUNCIATION') as QuestionType
        const normalizedContext = contextText || promptText || '（未填写语境句）'
        const targetWord = (question.targetWord || '').trim() || null
        const explanation = (question.explanation || '').trim() || null

        const rawOptions = Array.isArray(question.options) ? question.options : []
        const normalizedOptions =
          rawOptions.length > 0
            ? rawOptions.map((option, optionIndex) => ({
                id: option.id,
                text: (option.text || '').trim() || `选项 ${optionIndex + 1}`,
                isCorrect: Boolean(option.isCorrect),
              }))
            : [
                { id: '', text: '选项 1', isCorrect: true },
                { id: '', text: '选项 2', isCorrect: false },
                { id: '', text: '选项 3', isCorrect: false },
                { id: '', text: '选项 4', isCorrect: false },
              ]

        if (!normalizedOptions.some(option => option.isCorrect)) {
          normalizedOptions[0].isCorrect = true
        }

        const incomingQuestionId = (question.id || '').trim()
        if (incomingQuestionId && existingQuestionIdSet.has(incomingQuestionId)) {
          keepQuestionIds.push(incomingQuestionId)

          await tx.question.update({
            where: { id: incomingQuestionId },
            data: {
              questionType,
              prompt: promptText || null,
              contextSentence: normalizedContext,
              targetWord,
              explanation,
              order: index + 1,
            },
          })

          const existingOptionIdSet =
            existingOptionIdsByQuestion.get(incomingQuestionId) || new Set<string>()
          const keepOptionIds: string[] = []

          for (const option of normalizedOptions) {
            const optionId = (option.id || '').trim()
            if (optionId && existingOptionIdSet.has(optionId)) {
              keepOptionIds.push(optionId)
              await tx.questionOption.update({
                where: { id: optionId },
                data: { text: option.text, isCorrect: option.isCorrect },
              })
            } else {
              const createdOption = await tx.questionOption.create({
                data: {
                  questionId: incomingQuestionId,
                  text: option.text,
                  isCorrect: option.isCorrect,
                },
                select: { id: true },
              })
              keepOptionIds.push(createdOption.id)
            }
          }

          await tx.questionOption.deleteMany({
            where: {
              questionId: incomingQuestionId,
              id: { notIn: keepOptionIds },
            },
          })
        } else {
          const createdQuestion = await tx.question.create({
            data: {
              quizId: payload.quizId,
              questionType,
              prompt: promptText || null,
              contextSentence: normalizedContext,
              targetWord,
              explanation,
              order: index + 1,
              options: {
                create: normalizedOptions.map(option => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            },
            select: { id: true },
          })
          keepQuestionIds.push(createdQuestion.id)
        }
      }

      await tx.question.deleteMany({
        where: {
          quizId: payload.quizId,
          id: { notIn: keepQuestionIds },
        },
      })
    })

    revalidatePath('/manage')
    revalidatePath('/manage/level/[id]', 'page')
    revalidatePath('/manage/level/quiz/[id]', 'page')
    revalidatePath('/quizzes')
    revalidatePath('/quizzes/[id]', 'page')

    return { success: true }
  } catch (error) {
    console.error('updateQuizWithQuestions failed:', error)
    return { success: false, message: '保存失败，请稍后重试。' }
  }
}

export async function createCategory(data: { levelId: string; name: string }) {
  try {
    // Category.id 为手动字符串，后端统一生成
    const uniqueId = `cat_${Date.now()}`

    const newCategory = await prisma.category.create({
      data: {
        id: uniqueId,
        levelId: data.levelId,
        name: data.name,
        description: '在语料录入中心快速创建的试卷',
      },
      include: {
        level: { select: { title: true } },
      },
    })

    return { success: true, category: newCategory }
  } catch (error) {
    console.error(error)
    return { success: false, message: '新建试卷失败，请检查控制台。' }
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
      new Set(
        (meanings || [])
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )

    let exists = await prisma.vocabulary.findFirst({
      where: { word: normalizedWord },
    })

    if (!exists) {
      const targetKeys = new Set(buildVocabularyCanonicalKeys(normalizedWord))
      if (targetKeys.size > 0) {
        const candidates = await prisma.vocabulary.findMany()

        let bestCandidate: (typeof candidates)[number] | null = null
        let bestScore = -1
        for (const candidate of candidates) {
          const candidateKeys = buildVocabularyCanonicalKeys(candidate.word)
          const intersectCount = candidateKeys.filter(key =>
            targetKeys.has(key),
          ).length
          if (intersectCount === 0) continue
          const lengthScore = Math.max(
            0,
            6 - Math.abs(candidate.word.length - normalizedWord.length),
          )
          const score = intersectCount * 10 + lengthScore
          if (!bestCandidate || score > bestScore) {
            bestCandidate = candidate
            bestScore = score
          }
        }

        if (bestCandidate) {
          exists = bestCandidate
        }
      }
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
      const newSentence: VocabularySentenceRecord | null = normalizedContextSentence
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

export async function createVocabularyFolder(name: string) {
  try {
    const trimmedName = name.trim()
    if (!trimmedName) {
      return { success: false, message: '收藏夹名称不能为空' }
    }
    const folder = await prisma.vocabularyFolder.create({
      data: { name: trimmedName },
      select: { id: true, name: true, createdAt: true },
    })
    revalidatePath('/vocabulary')
    return { success: true, folder }
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { success: false, message: '收藏夹已存在' }
    }
    console.error(error)
    return { success: false, message: '创建收藏夹失败' }
  }
}

export async function assignVocabularyFolder(
  vocabularyId: string,
  folderId: string | null,
) {
  try {
    await prisma.vocabulary.update({
      where: { id: vocabularyId },
      data: { folderId: folderId || null },
      select: { id: true, folderId: true },
    })
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '收藏夹设置失败' }
  }
}

export async function deleteArticle(articleId: string) {
  try {
    // 使用 deleteMany，避免不存在时抛错
    const result = await prisma.article.deleteMany({
      where: {
        id: articleId,
      },
    })

    if (result.count === 0) {
      console.warn(`尝试删除不存在的文章 ID: ${articleId}`)
      return { success: true, message: '文章已移除' }
    }

    return { success: true, message: '删除成功' }
  } catch (error: any) {
    console.error('删除文章时发生未知错误:', error)
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

    revalidatePath('/retry')
    revalidatePath('/today')
    revalidatePath('/')

    return { success: true, message: '做题数据已永久保存入库！' }
  } catch (error: any) {
    console.error('保存做题数据失败:', error)
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
      data: { explanation },
    })
    return { success: true, message: '笔记已保存' }
  } catch (error: any) {
    console.error('保存笔记失败:', error)
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
    const articles = await prisma.article.findMany({
      where: { content: { contains: word } },
      select: { id: true, title: true, content: true },
    })

    const questions = await prisma.question.findMany({
      where: { prompt: { contains: word } },
      select: {
        prompt: true,
        contextSentence: true,
        quizId: true,
        quiz: { select: { title: true } },
      },
    })

    const results: {
      text: string
      source: string
      sourceUrl: string
      sourceType?: SourceType
    }[] = []
    articles.forEach(a => {
      const parts = a.content.match(/[^。！？.!\?\n]+[。！？.!\?\n]*/g) || [
        a.content,
      ]
      parts.forEach(p => {
        const t = p.trim()
        if (t.includes(word) && t.length > 5) {
          results.push({
            text: t,
            source: `📄 阅读：${a.title}`,
            sourceUrl: `/articles/${a.id}`,
            sourceType: 'ARTICLE_TEXT',
          })
        }
      })
    })

    questions.forEach(q => {
      const t = (q.contextSentence || q.prompt || '').trim()
      if (t.includes(word) && t.length > 5) {
        results.push({
          text: t,
          source: `📝 题目：${q.quiz?.title || '练习题'}`,
          sourceUrl: `/quizzes/${q.quizId}`,
          sourceType: 'QUIZ_QUESTION',
        })
      }
    })

    return { success: true, data: dedupeAndRankSentences(results, 12) }
  } catch (error) {
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
  } catch (error) {
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

export async function deleteVocabularySentence(id: string, sentenceText: string) {
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

export async function moveVocabularyToGroup(id: string, newGroupName: string) {
  try {
    await prisma.vocabulary.update({
      where: { id },
      data: { groupName: newGroupName },
    })
    return { success: true, message: '移动成功' }
  } catch (error) {
    return { success: false, message: '移动失败' }
  }
}

export async function deleteQuiz(quizId: string) {
  try {
    const result = await prisma.quiz.deleteMany({
      where: {
        id: quizId,
      },
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

export type SortableModel = 'Category' | 'Lesson' | 'Article' | 'Quiz' | 'Question'

export async function updateSortOrder(model: SortableModel, orderedIds: string[]) {
  try {
    const updatePromises = orderedIds.map((id, index) => {
      if (model === 'Question') {
        return prisma.question.update({
          where: { id },
          data: { order: index },
        })
      }

      return (prisma as any)[model.toLowerCase()].update({
        where: { id },
        data: { sortOrder: index },
      })
    })

    await prisma.$transaction(updatePromises)

    // Keep manage/public pages in sync after drag-sort persistence.
    revalidatePath('/manage')
    revalidatePath('/manage/level/[id]', 'page')
    revalidatePath('/level/[id]', 'page')
    revalidatePath('/lessons/[id]', 'page')
    revalidatePath('/articles')
    revalidatePath('/quizzes')

    return { success: true }
  } catch (error) {
    console.error(`更新 ${model} 排序失败:`, error)
    return { success: false, error: '排序更新失败' }
  }
}
