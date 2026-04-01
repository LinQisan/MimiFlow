// app/articles/[id]/page.tsx
import { notFound } from 'next/navigation'
import ArticleReaderUI from './ArticleReaderUI'
import prisma from '@/lib/prisma'

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params

  // 1. 获取文章详情，并按 order 顺序带出所有相关题目
  const article = await prisma.article.findUnique({
    where: { id: resolvedParams.id },
    include: {
      category: true,
      questions: {
        orderBy: { order: 'asc' }, // 🌟 保证题目顺序不乱
        include: {
          options: true,
          attempts: {
            take: 1000,
            orderBy: { createdAt: 'desc' },
            select: { isCorrect: true },
          },
        },
      },
    },
  })

  if (!article) notFound()

  const vocabularyWithPronunciation = await prisma.vocabulary.findMany({
    where: {
      OR: [
        { pronunciation: { not: null } },
        { pronunciations: { not: null } },
        { meanings: { not: null } },
      ],
    },
    select: {
      word: true,
      pronunciation: true,
      pronunciations: true,
      partOfSpeech: true,
      partsOfSpeech: true,
      meanings: true,
    },
  })

  const parseList = (value?: string | null): string[] => {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.map(item => String(item).trim()).filter(Boolean)
    } catch {
      return []
    }
  }
  const pronunciationMap = vocabularyWithPronunciation.reduce<
    Record<string, string>
  >((acc, item) => {
    const firstPron = parseList(item.pronunciations)[0]
    const finalPron = firstPron || item.pronunciation
    if (finalPron) acc[item.word] = finalPron
    return acc
  }, {})
  const vocabularyMetaMap = vocabularyWithPronunciation.reduce<
    Record<string, { pronunciations: string[]; partsOfSpeech: string[]; meanings: string[] }>
  >((acc, item) => {
    const pronunciations = parseList(item.pronunciations)
    const fallbackPronunciation = item.pronunciation?.trim()
    if (fallbackPronunciation && !pronunciations.includes(fallbackPronunciation)) {
      pronunciations.unshift(fallbackPronunciation)
    }
    const partsOfSpeech = parseList(item.partsOfSpeech)
    const fallbackPos = item.partOfSpeech?.trim()
    if (fallbackPos && !partsOfSpeech.includes(fallbackPos)) {
      partsOfSpeech.unshift(fallbackPos)
    }
    acc[item.word] = {
      pronunciations,
      partsOfSpeech,
      meanings: parseList(item.meanings),
    }
    return acc
  }, {})

  // 2. 将数据交给客户端 UI 引擎去渲染
  return (
    <ArticleReaderUI
      article={article}
      pronunciationMap={pronunciationMap}
      vocabularyMetaMap={vocabularyMetaMap}
    />
  )
}
