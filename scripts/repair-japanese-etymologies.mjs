import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { splitJapaneseEtymologies } from '../modules/language/domain/etymology.ts'
import { parseJsonStringList, toJsonStringList } from '../utils/text/jsonList.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })
const userId = process.argv.find(arg => arg.startsWith('--user-id='))?.slice('--user-id='.length)
if (!userId) throw new Error('请提供 --user-id=<当前用户ID>；默认只预览，--apply 才写入。')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  const rows = await prisma.vocabulary.findMany({
    where: { userId, pronunciations: { not: null } },
    select: { id: true, word: true, pronunciations: true, etymologies: true },
  })
  const changes = rows.flatMap(row => {
    const before = parseJsonStringList(row.pronunciations)
    if (splitJapaneseEtymologies(row.word, before).etymologies.length === 0) return []
    const result = splitJapaneseEtymologies(row.word, before, parseJsonStringList(row.etymologies))
    if (result.pronunciations.length === before.length) return []
    return [{ row, data: { pronunciations: toJsonStringList(result.pronunciations), etymologies: toJsonStringList(result.etymologies) } }]
  })
  let updated = 0
  if (process.argv.includes('--apply')) {
    for (let offset = 0; offset < changes.length; offset += 100) {
      const results = await prisma.$transaction(changes.slice(offset, offset + 100).map(({ row, data }) =>
        prisma.vocabulary.updateMany({
          // Do not overwrite a concurrent edit made after the initial read.
          where: { id: row.id, userId, pronunciations: row.pronunciations, etymologies: row.etymologies },
          data,
        }),
      ))
      updated += results.reduce((sum, result) => sum + result.count, 0)
    }
  }
  console.log(JSON.stringify({ candidates: changes.length, updated, examples: changes.slice(0, 8).map(({ row, data }) => ({ word: row.word, ...data })) }))
} finally {
  await prisma.$disconnect()
}
