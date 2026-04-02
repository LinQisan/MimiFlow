'use server'

import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/jsonList'

export type GlobalSearchResult = {
  id: string
  type: 'vocabulary' | 'sentence' | 'article' | 'quiz' | 'question' | 'dialogue'
  title: string
  snippet: string
  href: string
  meta: string
}

const shortText = (text: string, max = 96) => {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

export async function searchGlobalContent(
  keyword: string,
): Promise<GlobalSearchResult[]> {
  const q = keyword.trim()
  if (!q) return []

  const [vocabRows, sentenceRows, articleRows, quizRows, questionRows, dialogueRows] =
    await Promise.all([
      prisma.vocabulary.findMany({
        where: {
          OR: [
            { word: { contains: q } },
            { pronunciations: { contains: q } },
            { partsOfSpeech: { contains: q } },
            { meanings: { contains: q } },
          ],
        },
        include: {
          sentenceLinks: {
            include: { sentence: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.vocabularySentence.findMany({
        where: {
          OR: [{ text: { contains: q } }, { source: { contains: q } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { content: { contains: q } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.quiz.findMany({
        where: {
          OR: [{ title: { contains: q } }, { description: { contains: q } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.question.findMany({
        where: {
          OR: [
            { prompt: { contains: q } },
            { contextSentence: { contains: q } },
            { options: { some: { text: { contains: q } } } },
          ],
        },
        include: {
          quiz: { select: { id: true, title: true } },
          article: { select: { id: true, title: true } },
        },
        take: 10,
      }),
      prisma.dialogue.findMany({
        where: { text: { contains: q } },
        include: {
          lesson: { select: { id: true, title: true } },
        },
        orderBy: { id: 'desc' },
        take: 10,
      }),
    ])

  const results: GlobalSearchResult[] = [
    ...vocabRows.map(item => {
      const firstSentence = item.sentenceLinks[0]?.sentence
      const meanings = parseJsonStringList(item.meanings).slice(0, 2)
      const pronunciations = parseJsonStringList(item.pronunciations).slice(0, 1)
      return {
        id: `vocab-${item.id}`,
        type: 'vocabulary' as const,
        title: item.word,
        snippet:
          meanings.length > 0
            ? meanings.join('；')
            : shortText(firstSentence?.text || '暂无释义', 80),
        href: '/vocabulary',
        meta:
          pronunciations.length > 0
            ? `单词 · ${pronunciations.join(' / ')}`
            : '单词',
      }
    }),
    ...sentenceRows.map(item => ({
      id: `sentence-${item.id}`,
      type: 'sentence' as const,
      title: shortText(item.text, 44),
      snippet: shortText(item.text, 96),
      href: item.sourceUrl || '/sentences',
      meta: item.source || '句子来源',
    })),
    ...articleRows.map(item => ({
      id: `article-${item.id}`,
      type: 'article' as const,
      title: item.title || '未命名文章',
      snippet: shortText(item.description || item.content || '暂无摘要'),
      href: `/articles/${item.id}`,
      meta: '阅读',
    })),
    ...quizRows.map(item => ({
      id: `quiz-${item.id}`,
      type: 'quiz' as const,
      title: item.title || '未命名题库',
      snippet: shortText(item.description || '进入题库开始练习'),
      href: `/quizzes/${item.id}`,
      meta: '题库',
    })),
    ...questionRows.map(item => ({
      id: `question-${item.id}`,
      type: 'question' as const,
      title: shortText(item.prompt || item.contextSentence, 52),
      snippet: shortText(item.contextSentence || item.prompt || '', 100),
      href: item.quizId
        ? `/quizzes/${item.quizId}`
        : item.articleId
          ? `/articles/${item.articleId}`
          : '/quizzes',
      meta: item.quiz
        ? `题目 · ${item.quiz.title || '题库'}`
        : item.article
          ? `阅读题 · ${item.article.title || '文章'}`
          : '题目',
    })),
    ...dialogueRows.map(item => ({
      id: `dialogue-${item.id}`,
      type: 'dialogue' as const,
      title: shortText(item.text, 48),
      snippet: shortText(item.text, 100),
      href: `/lessons/${item.lessonId}`,
      meta: `听力 · ${item.lesson.title}`,
    })),
  ]

  return results.slice(0, 50)
}

