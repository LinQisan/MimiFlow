import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const normalizeJlpt = value => {
  const normalized = String(value || '').normalize('NFKC').trim().toUpperCase()
  return /^N[1-5]$/.test(normalized) ? normalized : null
}

const inferJlpt = (...values) => {
  for (const value of values) {
    const match = String(value || '')
      .normalize('NFKC')
      .toUpperCase()
      .match(/(?:^|[^A-Z0-9])(N[1-5])(?:$|[^A-Z0-9])/)
    if (match) return match[1]
  }
  return null
}

const isStructureTag = value => {
  const normalized = String(value || '').normalize('NFKC').trim()
  return normalizeJlpt(normalized) || /^unit[\s_-]*0*\d+$/i.test(normalized)
}

async function repair() {
  const structureTags = (await prisma.vocabularyTag.findMany({
    select: { id: true, name: true },
  })).filter(tag => isStructureTag(tag.name))
  const structureTagIds = new Set(structureTags.map(tag => tag.id))

  const entries = await prisma.wordbookVocabulary.findMany({
    select: {
      id: true,
      jlpt: true,
      wordbook: {
        select: { title: true, series: { select: { title: true } } },
      },
      vocabulary: {
        select: {
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
      },
    },
  })

  let updatedEntries = 0
  for (const entry of entries) {
    if (normalizeJlpt(entry.jlpt)) continue
    const vocabularyLevels = entry.vocabulary.tags
      .filter(link => structureTagIds.has(link.tag.id))
      .map(link => normalizeJlpt(link.tag.name))
      .filter(Boolean)
    const inferred =
      inferJlpt(entry.wordbook.series.title, entry.wordbook.title) ||
      (new Set(vocabularyLevels).size === 1 ? vocabularyLevels[0] : null)
    if (!inferred) continue
    await prisma.wordbookVocabulary.update({
      where: { id: entry.id },
      data: { jlpt: inferred },
    })
    updatedEntries += 1
  }

  const removedLinks = structureTags.length
    ? await prisma.vocabularyTagOnVocabulary.deleteMany({
        where: { tagId: { in: structureTags.map(tag => tag.id) } },
      })
    : { count: 0 }
  const removedTags = structureTags.length
    ? await prisma.vocabularyTag.deleteMany({
        where: { id: { in: structureTags.map(tag => tag.id) } },
      })
    : { count: 0 }

  console.log(JSON.stringify({
    updatedEntries,
    removedTagLinks: removedLinks.count,
    removedTags: removedTags.count,
  }))
}

repair()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
