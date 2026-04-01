// app/actions/content.ts
'use server'

import { SourceType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

const parseJsonList = (value?: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

const toJsonList = (list: string[]) => {
  const normalized = Array.from(new Set(list.map(s => s.trim()).filter(Boolean)))
  return normalized.length ? JSON.stringify(normalized) : null
}

type VocabularySentenceRecord = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
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

const parseVocabularySentences = (
  contextSentence: string | null,
): VocabularySentenceRecord[] => {
  try {
    const parsed = JSON.parse(contextSentence || '[]')
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === 'string') {
            return { text: item, source: '未知来源', sourceUrl: '#' }
          }
          if (item && typeof item === 'object') {
            const record = item as Partial<VocabularySentenceRecord> & {
              text?: unknown
              source?: unknown
              sourceUrl?: unknown
              meaningIndex?: unknown
            }
            const text = String(record.text || '').trim()
            if (!text) return null
            const meaningIndex =
              typeof record.meaningIndex === 'number' &&
              Number.isInteger(record.meaningIndex) &&
              record.meaningIndex >= 0
                ? record.meaningIndex
                : null
            return {
              text,
              source: String(record.source || '未知来源'),
              sourceUrl: String(record.sourceUrl || '#'),
              meaningIndex,
            }
          }
          return null
        })
        .filter((item): item is VocabularySentenceRecord => !!item)
    }
    if (contextSentence) {
      return [{ text: contextSentence, source: '未知来源', sourceUrl: '#' }]
    }
    return []
  } catch {
    if (contextSentence) {
      return [{ text: contextSentence, source: '未知来源', sourceUrl: '#' }]
    }
    return []
  }
}

// ==========================================
// 1. 创建文章 (聪明的段落切分)
// ==========================================
// app/actions/content.ts

export async function createArticle(data: any) {
  try {
    await prisma.article.create({
      data: {
        title: data.title,
        content: data.content,
        categoryId: data.categoryId,
        description: data.description,

        questions: {
          // 🌟 核心修复：在这里加上 index，并把 index + 1 赋值给 order
          create:
            data.questions?.map((q: any, index: number) => ({
              questionType: q.questionType || 'READING_COMPREHENSION',
              prompt: q.prompt,
              contextSentence: q.contextSentence || '',
              explanation: q.explanation || '',

              order: index + 1, // 👈 完美修复：自动生成 1, 2, 3... 的题号！

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

// ==========================================
// 2. 创建单道题目 (带选项)
// ==========================================
export async function createQuizQuestion(data: any) {
  try {
    if (!data.categoryId) return { success: false, message: '请选择所属试卷！' }

    // 1. 智能查找：看看这套试卷 (Category) 下面是否已经建过题库 (Quiz) 了
    let quiz = await prisma.quiz.findFirst({
      where: { categoryId: data.categoryId },
    })

    // 2. 如果这套卷子还没建过题库，就自动建一个
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

    // 3. 把这道题塞进这个题库里
    const question = await prisma.question.create({
      data: {
        quizId: quiz.id,
        questionType: data.questionType,
        contextSentence: data.contextSentence,
        targetWord: data.targetWord,
        prompt: data.prompt,
        explanation: data.explanation,
        order: 1,
        options: {
          create: data.options.map((opt: any) => ({
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
    // 你的 schema 里 Category 的 id 是手动指定的 String (没有 @default(cuid))
    // 所以我们在后端自动帮它生成一个唯一的 ID，避免让用户手动填英文 ID
    const uniqueId = `cat_${Date.now()}`

    const newCategory = await prisma.category.create({
      data: {
        id: uniqueId,
        levelId: data.levelId,
        name: data.name,
        description: '在语料录入中心快速创建的试卷',
      },
      // 把 level 的名字也查回来，方便前端直接显示
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
  sourceType: SourceType, // 🌟 新增：要求传入来源类型
  sourceId: string, // 🌟 新增：要求传入来源ID
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
    const primaryPronunciation =
      pronunciation?.trim() || normalizedPronunciations[0] || null

    // 查重逻辑保持不变...
    const exists = await prisma.vocabulary.findFirst({
      where: { word: trimmedWord },
    })

    if (exists) {
      const currentList = parseJsonList(exists.pronunciations)
      const mergedPronunciations = toJsonList([
        primaryPronunciation || '',
        ...normalizedPronunciations,
        ...currentList,
      ])
      const mergedMeanings = toJsonList([
        ...normalizedMeanings,
        ...parseJsonList(exists.meanings),
      ])
      const mergedPartsOfSpeech = toJsonList([
        ...normalizedPartsOfSpeech,
        ...parseJsonList(exists.partsOfSpeech),
        ...(exists.partOfSpeech ? [exists.partOfSpeech] : []),
      ])
      const existingSentences = parseVocabularySentences(exists.contextSentence)
      const newSentence: VocabularySentenceRecord | null = normalizedContextSentence
        ? {
            text: normalizedContextSentence,
            source: sourceMeta.source,
            sourceUrl: sourceMeta.sourceUrl,
            meaningIndex: null,
          }
        : null
      const hasSameSentence =
        newSentence &&
        existingSentences.some(item => item.text === newSentence.text)
      const nextSentences =
        newSentence && !hasSameSentence
          ? [...existingSentences, newSentence]
          : existingSentences

      await prisma.vocabulary.update({
        where: { id: exists.id },
        data: {
          pronunciation: primaryPronunciation || exists.pronunciation,
          pronunciations: mergedPronunciations,
          partOfSpeech: normalizedPartsOfSpeech[0] || exists.partOfSpeech,
          partsOfSpeech: mergedPartsOfSpeech,
          meanings: mergedMeanings,
          contextSentence:
            nextSentences.length > 0 ? JSON.stringify(nextSentences) : '',
        },
      })

      if (newSentence && !hasSameSentence) {
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

    // 🌟 核心修复：把四个必填字段全部喂给 Prisma
    await prisma.vocabulary.create({
      data: {
        word: trimmedWord,
        contextSentence: normalizedContextSentence
          ? JSON.stringify([
              {
                text: normalizedContextSentence,
                source: sourceMeta.source,
                sourceUrl: sourceMeta.sourceUrl,
                meaningIndex: null,
              } satisfies VocabularySentenceRecord,
            ])
          : '',
        sourceType: sourceType, // 告诉数据库它是文章、听力还是题目
        sourceId: sourceId, // 对应的 article.id 或 quiz.id
        pronunciation: primaryPronunciation,
        pronunciations: toJsonList([
          primaryPronunciation || '',
          ...normalizedPronunciations,
        ]),
        partOfSpeech: normalizedPartsOfSpeech[0] || null,
        partsOfSpeech: toJsonList(normalizedPartsOfSpeech),
        meanings: toJsonList(normalizedMeanings),
      },
    })

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
        pronunciation: nextPron || null,
        pronunciations: toJsonList(nextPron ? [nextPron] : []),
      },
    })
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}

export async function updateVocabularyPronunciationByWord(
  word: string,
  pronunciation: string,
) {
  try {
    const target = await prisma.vocabulary.findFirst({
      where: { word: word.trim() },
      select: { id: true },
    })
    if (!target) return { success: false, message: '未找到该单词' }

    const nextPron = pronunciation.trim()
    await prisma.vocabulary.update({
      where: { id: target.id },
      data: {
        pronunciation: nextPron || null,
        pronunciations: toJsonList(nextPron ? [nextPron] : []),
      },
    })
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}

// ==========================================
// 🗑️ 删除功能
// ==========================================
export async function deleteArticle(articleId: string) {
  try {
    // 🌟 核心修复：将 .delete 换成 .deleteMany
    // 这样即使 articleId 不存在，代码也会静默通过，不会崩溃
    const result = await prisma.article.deleteMany({
      where: {
        id: articleId,
      },
    })

    // 虽然 deleteMany 不报错，但我们可以检查是否真的删掉了东西
    if (result.count === 0) {
      console.warn(`尝试删除不存在的文章 ID: ${articleId}`)
      // 依然返回成功，因为结果（文章没了）已经达到了
      return { success: true, message: '文章已移除' }
    }

    return { success: true, message: '删除成功' }
  } catch (error: any) {
    console.error('删除文章时发生未知错误:', error)
    return { success: false, message: '服务器内部错误，删除失败' }
  }
}

// ==========================================
// ✏️ 更新功能
// ==========================================
export async function updateArticle(
  articleId: string,
  data: { title: string; description: string; content: string },
) {
  try {
    // 🌟 终极优化：一次性更新所有字段，告别复杂的切分和多表操作！
    await prisma.article.update({
      where: { id: articleId },
      data: {
        title: data.title,
        description: data.description,
        content: data.content, // 保留了换行符的完整长文本覆盖进去
      },
    })

    return { success: true, message: '文章更新成功！' }
  } catch (error) {
    console.error('更新文章失败:', error)
    return { success: false, message: '更新失败，请重试。' }
  }
}

export async function updateQuizTitle(quizId: string, title: string) {
  try {
    await prisma.quiz.update({ where: { id: quizId }, data: { title } })
    return { success: true, message: '题库标题更新成功！' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '更新失败。' }
  }
}

// app/actions/content.ts
// ... 前面原有的代码保留

// app/actions/content.ts

export async function updateQuizComplete(quizId: string, data: any) {
  try {
    // 1. 更新题库大标题
    await prisma.quiz.update({
      where: { id: quizId },
      data: { title: data.title },
    })

    // 2. 遍历更新每一道题
    for (const q of data.questions) {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          questionType: q.questionType,
          targetWord: q.targetWord,
          prompt: q.prompt,
          contextSentence: q.contextSentence,
          explanation: q.explanation,

          // 🌟 神级用法：嵌套更新选项 (Nested Update)
          // 这样写完全不需要管数据库里的选项表到底叫什么名字！
          options: {
            update: q.options.map((opt: any) => ({
              where: { id: opt.id },
              data: {
                text: opt.text,
                isCorrect: opt.isCorrect,
              },
            })),
          },
        },
      })
    }

    return { success: true, message: '题库及所有题目更新成功！' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '更新失败，请检查控制台。' }
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
    // 采用 createMany 批量插入，性能最高
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

// app/actions/content.ts

// 🌟 1. 删除单词
export async function deleteVocabulary(id: string) {
  try {
    await prisma.vocabulary.delete({ where: { id } })
    return { success: true, message: '删除成功' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除失败' }
  }
}

// 🌟 2. 更新单词例句
// app/actions/content.ts

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

// 🌟 2. 追加新例句 (接收对象，并兼容老数据的转换)
export async function addVocabularySentence(
  id: string,
  newSentenceObj: { text: string; source: string; sourceUrl: string },
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const sentences = parseVocabularySentences(vocab.contextSentence)
    const normalizedSentence: VocabularySentenceRecord = {
      text: newSentenceObj.text.trim(),
      source: newSentenceObj.source.trim() || '未知来源',
      sourceUrl: newSentenceObj.sourceUrl.trim() || '#',
      meaningIndex: null,
    }
    if (!normalizedSentence.text) {
      return { success: false, message: '例句为空' }
    }

    // 防止重复添加同样的句子
    if (!sentences.some(s => s.text === normalizedSentence.text)) {
      sentences.push(normalizedSentence)
    }

    await prisma.vocabulary.update({
      where: { id },
      data: { contextSentence: JSON.stringify(sentences) },
    })
    return { success: true, message: '例句已添加', sentences }
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

    const sentences = parseVocabularySentences(vocab.contextSentence)
    const targetText = sentenceText.trim()
    const targetIdx = sentences.findIndex(item => item.text === targetText)
    if (targetIdx < 0) {
      return { success: false, message: '未找到该例句' }
    }

    sentences[targetIdx] = {
      ...sentences[targetIdx],
      meaningIndex,
    }

    await prisma.vocabulary.update({
      where: { id },
      data: { contextSentence: JSON.stringify(sentences) },
    })
    revalidatePath('/vocabulary')
    return { success: true, message: '释义匹配已保存' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '保存失败' }
  }
}

// app/actions/content.ts

// 🌟 新增：移动单词到新分组
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

// 🌟 修复 1：在类型定义中加入 'Question'
export type SortableModel = 'Category' | 'Lesson' | 'Article' | 'Quiz' | 'Question'

export async function updateSortOrder(model: SortableModel, orderedIds: string[]) {
  try {
    // 遍历传入的 ID 数组，生成更新操作
    const updatePromises = orderedIds.map((id, index) => {
      
      // 🌟 修复 2：针对 Question 模型，使用 order 字段！
      if (model === 'Question') {
        return prisma.question.update({
          where: { id },
          data: { order: index }, // 注意你的 Schema 里叫 order
        })
      } 
      
      // 针对其他模型，依然使用 sortOrder 字段
      return (prisma as any)[model.toLowerCase()].update({
        where: { id },
        data: { sortOrder: index },
      })
    })

    // 使用事务 (transaction) 保证所有更新要么全成功，要么全失败
    await prisma.$transaction(updatePromises)
    
    return { success: true }
  } catch (error) {
    console.error(`更新 ${model} 排序失败:`, error)
    return { success: false, error: '排序更新失败' }
  }
}
