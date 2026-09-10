import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const SERIES_TITLE = 'N2語彙トレーニング'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const parseMeanings = value => {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

async function repair() {
  const series = await prisma.wordbookSeries.findFirst({
    where: { title: SERIES_TITLE },
    select: {
      id: true,
      title: true,
      wordbooks: {
        select: { id: true, title: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!series) throw new Error(`未找到词书系列：${SERIES_TITLE}`)

  let repairedSources = 0
  let assignedMeanings = 0

  for (const wordbook of series.wordbooks) {
    const links = await prisma.vocabularySentenceLink.findMany({
      where: {
        vocabulary: { wordbooks: { some: { wordbookId: wordbook.id } } },
        sentence: {
          source: {
            in: [wordbook.title, `${series.title} › ${wordbook.title}`],
          },
        },
      },
      select: {
        id: true,
        meaningIndex: true,
        vocabulary: { select: { meanings: true } },
        sentence: {
          select: {
            id: true,
            source: true,
            sourceUrl: true,
            sourceType: true,
            sourceId: true,
          },
        },
      },
    })

    for (const link of links) {
      const source = `${series.title} › ${wordbook.title}`
      const sourceUrl = `/vocabulary/wordbooks/${wordbook.id}`
      const sourceNeedsRepair =
        link.sentence.source !== source ||
        link.sentence.sourceUrl !== sourceUrl ||
        link.sentence.sourceType !== null ||
        link.sentence.sourceId !== null
      const meaningNeedsRepair =
        link.meaningIndex === null &&
        parseMeanings(link.vocabulary.meanings).length > 0

      await prisma.$transaction([
        ...(sourceNeedsRepair
          ? [
              prisma.vocabularySentence.update({
                where: { id: link.sentence.id },
                data: { source, sourceUrl, sourceType: null, sourceId: null },
              }),
            ]
          : []),
        ...(meaningNeedsRepair
          ? [
              prisma.vocabularySentenceLink.update({
                where: { id: link.id },
                data: { meaningIndex: 0 },
              }),
            ]
          : []),
      ])
      if (sourceNeedsRepair) repairedSources += 1
      if (meaningNeedsRepair) assignedMeanings += 1
    }
  }

  console.log(
    JSON.stringify({
      series: series.title,
      wordbooks: series.wordbooks.length,
      repairedSources,
      assignedMeanings,
    }),
  )
}

try {
  await repair()
} finally {
  await prisma.$disconnect()
}
