import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const SERIES_TITLE = 'N2語彙トレーニング'
const N2_PRIMARY_PRONUNCIATIONS = new Map([
  ['外', 'ほか'],
  ['辛い', 'つらい'],
  ['乾燥', 'かんそう'],
])

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const parseList = value => {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed)
      ? parsed.map(item => String(item).trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

async function repair() {
  const rows = await prisma.vocabulary.findMany({
    where: {
      wordbooks: { some: { wordbook: { series: { title: SERIES_TITLE } } } },
    },
    select: { id: true, word: true, pronunciations: true },
  })

  let updated = 0
  for (const row of rows) {
    const pronunciations = parseList(row.pronunciations)
    const preferred = N2_PRIMARY_PRONUNCIATIONS.get(row.word)
    if (!preferred || !pronunciations.includes(preferred)) continue

    const next = [preferred, ...pronunciations.filter(item => item !== preferred)]
    const serialized = JSON.stringify(next)
    if (serialized === row.pronunciations) continue
    await prisma.vocabulary.update({
      where: { id: row.id },
      data: { pronunciations: serialized },
    })
    updated += 1
  }

  console.log(JSON.stringify({ series: SERIES_TITLE, checked: rows.length, updated }))
}

try {
  await repair()
} finally {
  await prisma.$disconnect()
}
