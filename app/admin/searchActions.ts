// app/admin/manage/searchActions.ts
'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

type VocabularyMetaPayload = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

const normalizeList = (list: string[]) =>
  Array.from(
    new Set(
      list
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const toJsonString = (list: string[]) =>
  list.length ? JSON.stringify(list) : null

// ==========================================
// 1. 全局全量语料搜索 (听力 + 阅读 + 题目)
// ==========================================
export async function searchGlobalCorpus(keyword: string) {
  if (!keyword.trim()) return []
  const k = keyword.trim()

  // 1.1 搜听力字幕
  const dialogues = await prisma.dialogue.findMany({
    where: { text: { contains: k } },
    include: {
      lesson: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
    orderBy: { id: 'desc' },
  })

  // 1.2 搜阅读文章段落
  // 1.2 搜阅读文章 (多维度 & 忽略大小写 & 字段精简)
  // 1.2 搜阅读文章 (多维度 & 字段精简)
  const articles = await prisma.article.findMany({
    where: {
      // 🌟 优化 1：使用 OR 多条件查询，标题、简介、正文，命中任何一个都算！
      OR: [
        { title: { contains: k } },
        { description: { contains: k } },
        { content: { contains: k } },
      ],
    },
    // 🌟 优化 2：弃用 include，改用 select 精准获取字段，极大提升传输速度！
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      content: true, // 如果搜索列表不需要展示正文详情，强烈建议把这行设为 false 或直接删掉！
      category: {
        select: { name: true }, // 🌟 优化 3：只拿分类名称即可
      },
    },
    take: 15,
    // 🌟 优化 4：按时间倒序，优先展示最新发布的文章
    orderBy: {
      createdAt: 'desc',
    },
  })
  // 1.3 搜题目题干
  const questions = await prisma.question.findMany({
    where: { contextSentence: { contains: k } },
    include: {
      quiz: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
  })

  // 🌟 将三种不同的数据结构，映射拼接为统一的“搜索结果卡片”格式
  const results = [
    ...dialogues.map(d => ({
      id: d.id,
      type: 'AUDIO_DIALOGUE',
      text: d.text,
      sourceTitle: `🎧 ${d.lesson?.title}`,
      categoryName: d.lesson?.category?.name || '未知分类',
    })),
    ...articles.map(a => ({
      id: a.id,
      type: 'ARTICLE_TEXT', // 保持前端标识符不变
      // 🌟 核心修改 1：如果没有写简介，就截取正文的前 100 个字作为搜索预览
      text:
        a.description ||
        (a.content ? a.content.substring(0, 100) + '...' : '暂无内容'),
      // 🌟 核心修改 2：a 现在直接就是文章本体，直接取 a.title
      sourceTitle: `📄 ${a.title}`,
      // 🌟 核心修改 3：直接取 a.category?.name
      categoryName: a.category?.name || '未知分类',
    })),
    ...questions.map(q => ({
      id: q.id,
      type: 'QUIZ_QUESTION',
      text: q.contextSentence,
      sourceTitle: `📝 ${q.quiz?.title}`,
      categoryName: q.quiz?.category?.name || '未知分类',
    })),
  ]

  return results
}

// ==========================================
// 2. 获取后台所有生词列表
// ==========================================
export async function getAllVocabulariesAdmin() {
  // 🌟 极速查询：因为之前重构时我们把 contextSentence 和 sourceType 固化到了表里，
  // 现在完全不需要 include 复杂的连表查询了，极大提升了后台加载速度！
  return await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

// ==========================================
// 3. 删除生词
// ==========================================
export async function deleteVocabularyAdmin(vocabId: string) {
  try {
    await prisma.vocabulary.delete({ where: { id: vocabId } })
    revalidatePath('/admin/manage')
    revalidatePath('/admin/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function updateVocabularyMetaAdmin(
  vocabId: string,
  payload: VocabularyMetaPayload,
) {
  try {
    const pronunciations = normalizeList(payload.pronunciations)
    const partsOfSpeech = normalizeList(payload.partsOfSpeech)
    const meanings = normalizeList(payload.meanings)
    const primaryPronunciation = pronunciations[0] || null
    const primaryPartOfSpeech = partsOfSpeech[0] || null

    await prisma.vocabulary.update({
      where: { id: vocabId },
      data: {
        pronunciation: primaryPronunciation,
        pronunciations: toJsonString(pronunciations),
        partOfSpeech: primaryPartOfSpeech,
        partsOfSpeech: toJsonString(partsOfSpeech),
        meanings: toJsonString(meanings),
      },
    })

    revalidatePath('/admin/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/articles')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}
