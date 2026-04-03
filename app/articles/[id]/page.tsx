// app/articles/[id]/page.tsx
import { notFound } from 'next/navigation'
import ArticleReaderUI from './ArticleReaderUI'
import prisma from '@/lib/prisma'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabularyMeta'

type SentenceMeaningRef = {
  sentence: string
  meaningIndex: number | null
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params

  // 获取文章与题目详情，按题号排序
  const article = await prisma.passage.findUnique({
    where: { id: resolvedParams.id },
    include: {
      paper: true,
      questions: {
        orderBy: { order: 'asc' },
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

  const vocabularyRows = await prisma.vocabulary.findMany({
    where: {
      OR: [
        { pronunciations: { not: null } },
        { meanings: { not: null } },
      ],
    },
    select: {
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
    },
  })

  const mappedMeaningRows = await prisma.vocabulary.findMany({
    where: {
      sentenceLinks: {
        some: {
          sentence: {
            sourceType: 'ARTICLE_TEXT',
            sourceId: article.id,
          },
        },
      },
    },
    select: {
      word: true,
      sentenceLinks: {
        where: {
          sentence: {
            sourceType: 'ARTICLE_TEXT',
            sourceId: article.id,
          },
        },
        select: {
          meaningIndex: true,
          sentence: { select: { text: true } },
        },
      },
    },
  })

  const sentenceMeaningMap = mappedMeaningRows.reduce<
    Record<string, SentenceMeaningRef[]>
  >((acc, row) => {
    const refs = row.sentenceLinks
      .map(link => ({
        sentence: link.sentence.text || '',
        meaningIndex: link.meaningIndex ?? null,
      }))
      .filter(item => item.sentence.trim().length > 0)
    if (refs.length > 0) acc[row.word] = refs
    return acc
  }, {})

  const pronunciationMap: Record<string, string> = {}
  const vocabularyMetaMap = vocabularyRows.reduce<
    Record<string, VocabularyMeta>
  >((acc, item) => {
    const meta = toVocabularyMeta({ ...item, word: item.word })
    acc[item.word] = meta
    if (meta.pronunciations[0]) pronunciationMap[item.word] = meta.pronunciations[0]
    return acc
  }, {})

  // 2. 将数据交给客户端 UI 引擎去渲染
  return (
    <ArticleReaderUI
      article={article}
      pronunciationMap={pronunciationMap}
      vocabularyMetaMap={vocabularyMetaMap}
      sentenceMeaningMap={sentenceMeaningMap}
    />
  )
}
