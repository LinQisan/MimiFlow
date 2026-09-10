import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const WORDBOOK_ID = 'cmthkeh8d00000v3qwyinx9ci'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const adjectiveTypeFor = word =>
  word.normalize('NFKC').trim().endsWith('な') ? 'な形容詞' : 'い形容詞'

async function repair() {
  const wordbook = await prisma.wordbook.findUnique({
    where: { id: WORDBOOK_ID },
    select: {
      title: true,
      entries: {
        select: {
          vocabulary: {
            select: {
              id: true,
              word: true,
              partsOfSpeech: true,
              sentenceLinks: { select: { id: true, posTags: true } },
            },
          },
        },
      },
    },
  })
  if (!wordbook) throw new Error(`未找到词表：${WORDBOOK_ID}`)

  let updatedWords = 0
  let updatedSentenceLinks = 0

  for (const entry of wordbook.entries) {
    const vocabulary = entry.vocabulary
    const partOfSpeech = adjectiveTypeFor(vocabulary.word)
    const serialized = JSON.stringify([partOfSpeech])
    const operations = []

    if (vocabulary.partsOfSpeech !== serialized) {
      operations.push(
        prisma.vocabulary.update({
          where: { id: vocabulary.id },
          data: { partsOfSpeech: serialized },
        }),
      )
      updatedWords += 1
    }

    const sentenceLinkIds = vocabulary.sentenceLinks
      .filter(link => link.posTags !== serialized)
      .map(link => link.id)
    if (sentenceLinkIds.length > 0) {
      operations.push(
        prisma.vocabularySentenceLink.updateMany({
          where: { id: { in: sentenceLinkIds } },
          data: { posTags: serialized },
        }),
      )
      updatedSentenceLinks += sentenceLinkIds.length
    }

    if (operations.length > 0) await prisma.$transaction(operations)
  }

  console.log(
    JSON.stringify({
      wordbook: wordbook.title,
      words: wordbook.entries.length,
      updatedWords,
      updatedSentenceLinks,
    }),
  )
}

try {
  await repair()
} finally {
  await prisma.$disconnect()
}
