// app/admin/manage/searchActions.ts
'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import {
  normalizeStringList,
  parseJsonStringList,
  toJsonStringList,
} from '@/utils/jsonList'

type VocabularyMetaPayload = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

// ==========================================
// 1. 全局全量语料搜索 (听力 + 阅读 + 题目)
// ==========================================
export async function searchGlobalCorpus(keyword: string) {
  if (!keyword.trim()) return []
  const k = keyword.trim()

  // 搜听力字幕
  const dialogues = await prisma.dialogue.findMany({
    where: { text: { contains: k } },
    include: {
      lesson: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
    orderBy: { id: 'desc' },
  })

  // 搜阅读文章
  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { title: { contains: k } },
        { description: { contains: k } },
        { content: { contains: k } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      content: true,
      category: {
        select: { name: true },
      },
    },
    take: 15,
    orderBy: {
      createdAt: 'desc',
    },
  })
  // 搜题目题干
  const questions = await prisma.question.findMany({
    where: { contextSentence: { contains: k } },
    include: {
      quiz: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
  })

  // 统一映射为搜索结果结构
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
      type: 'ARTICLE_TEXT',
      text:
        a.description ||
        (a.content ? a.content.substring(0, 100) + '...' : '暂无内容'),
      sourceTitle: `📄 ${a.title}`,
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
  const rows = await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      sentenceLinks: {
        include: { sentence: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  return rows.map(item => {
    const { sentenceLinks, ...rest } = item
    return {
      ...rest,
      pronunciations: parseJsonStringList(item.pronunciations),
      partsOfSpeech: parseJsonStringList(item.partsOfSpeech),
      meanings: parseJsonStringList(item.meanings),
      sentences: sentenceLinks.map(link => ({
        text: link.sentence.text,
        source: link.sentence.source,
        sourceUrl: link.sentence.sourceUrl,
        meaningIndex: link.meaningIndex,
        posTags: parseJsonStringList(link.posTags).slice(0, 1),
      })),
    }
  })
}

// ==========================================
// 3. 删除生词
// ==========================================
export async function deleteVocabularyAdmin(vocabId: string) {
  try {
    await prisma.vocabulary.delete({ where: { id: vocabId } })
    revalidatePath('/manage')
    revalidatePath('/manage/vocabulary')
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
    const pronunciations = normalizeStringList(payload.pronunciations)
    const partsOfSpeech = normalizeStringList(payload.partsOfSpeech)
    const meanings = normalizeStringList(payload.meanings)

    await prisma.vocabulary.update({
      where: { id: vocabId },
      data: {
        pronunciations: toJsonStringList(pronunciations),
        partsOfSpeech: toJsonStringList(partsOfSpeech),
        meanings: toJsonStringList(meanings),
      },
    })

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/articles')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}
