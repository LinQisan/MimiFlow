// app/actions/content.ts
'use server'

import { SourceType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { parseJsonStringList, toJsonStringList } from '@/utils/jsonList'

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(new Set((list || []).map(item => item.trim()).filter(Boolean))).slice(
    0,
    1,
  )

type VocabularySentenceRecord = {
  text: string
  source: string
  sourceUrl: string
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
      source: sentence.source.trim() || '未知来源',
      sourceType: sentence.sourceType,
      sourceId: sentence.sourceId || null,
    },
    create: {
      text,
      normalizedText,
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
  return links.map(link => ({
    text: link.sentence.text,
    source: link.sentence.source,
    sourceUrl: link.sentence.sourceUrl,
    meaningIndex: link.meaningIndex ?? null,
    posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
  }))
}

export async function createArticle(data: any) {
  try {
    const trimmedTitle = (data.title || '').trim()
    const fallbackTitle = `阅读_${new Date().toISOString().slice(0, 10)}`
    const articleTitle = trimmedTitle || fallbackTitle

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

    const normalizedPronunciations = Array.from(
      new Set(
        (pronunciations || [])
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )
    const normalizedPartsOfSpeech = Array.from(
      new Set(
        [partOfSpeech || '', ...(partsOfSpeech || [])]
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )
    const normalizedMeanings = Array.from(
      new Set(
        (meanings || [])
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )

    const exists = await prisma.vocabulary.findFirst({
      where: { word: trimmedWord },
    })

    if (exists) {
      const mergedPronunciations = toJsonStringList([
        pronunciation?.trim() || '',
        ...normalizedPronunciations,
        ...parseJsonStringList(exists.pronunciations),
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
        word: trimmedWord,
        sourceType: sourceType,
        sourceId: sourceId,
        pronunciations: toJsonStringList([
          pronunciation?.trim() || '',
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
    const nextPron = pronunciation.trim()
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
    await prisma.questionAttempt.createMany({
      data: attempts,
    })

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

    const results: { text: string; source: string; sourceUrl: string }[] = []
    const seen = new Set<string>()

    articles.forEach(a => {
      const parts = a.content.match(/[^。！？.!\?\n]+[。！？.!\?\n]*/g) || [
        a.content,
      ]
      parts.forEach(p => {
        const t = p.trim()
        if (t.includes(word) && t.length > 5 && !seen.has(t)) {
          seen.add(t)
          results.push({
            text: t,
            source: `📄 阅读：${a.title}`,
            sourceUrl: `/articles/${a.id}`,
          })
        }
      })
    })

    questions.forEach(q => {
      const t = (q.contextSentence || q.prompt || '').trim()
      if (t.includes(word) && t.length > 5 && !seen.has(t)) {
        seen.add(t)
        results.push({
          text: t,
          source: `📝 题目：${q.quiz?.title || '练习题'}`,
          sourceUrl: `/quizzes/${q.quizId}`,
        })
      }
    })

    return { success: true, data: results.slice(0, 5) }
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
      await prisma.vocabularySentenceLink.update({
        where: { id: link.id },
        data: { posTags: toJsonStringList(normalized) },
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
