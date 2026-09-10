import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const parseList = value => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).map(item => item.trim()).filter(Boolean) : []
  } catch {
    return String(value).split(/[\n,，;；]/u).map(item => item.trim()).filter(Boolean)
  }
}

const inferPartOfSpeech = values => {
  const value = values.join(' ').normalize('NFKC')
  if (/イ形容|い形容/u.test(value)) return 'i_adjective'
  if (/ナ形容|な形容|形容動詞/u.test(value)) return 'na_adjective'
  if (/動詞/u.test(value)) return 'verb'
  if (/副詞/u.test(value)) return 'adverb'
  if (/連体詞/u.test(value)) return 'adnominal'
  if (/名詞/u.test(value)) return 'noun'
  return 'other'
}

async function migrate() {
  const [vocabularies, existingSenses, existingDefinitions] = await Promise.all([
    prisma.vocabulary.findMany({ select: { id: true, meanings: true, partsOfSpeech: true, grammarPartOfSpeech: true } }),
    prisma.vocabularySense.findMany({ select: { id: true, vocabularyId: true, order: true } }),
    prisma.vocabularyDefinition.findMany({ select: { id: true, vocabularyId: true, definition: true, senseId: true } }),
  ])
  const vocabularyIdsWithSenses = new Set(existingSenses.map(sense => sense.vocabularyId))
  const newSenses = vocabularies.flatMap(vocabulary => {
    if (vocabularyIdsWithSenses.has(vocabulary.id)) return []
    const count = Math.max(1, parseList(vocabulary.meanings).length)
    return Array.from({ length: count }, (_, order) => ({ id: randomUUID(), vocabularyId: vocabulary.id, order }))
  })
  if (newSenses.length > 0) await prisma.vocabularySense.createMany({ data: newSenses, skipDuplicates: true })

  const senses = await prisma.vocabularySense.findMany({
    orderBy: [{ vocabularyId: 'asc' }, { order: 'asc' }],
    select: { id: true, vocabularyId: true, order: true },
  })
  const sensesByVocabulary = new Map()
  for (const sense of senses) {
    const list = sensesByVocabulary.get(sense.vocabularyId) || []
    list.push(sense)
    sensesByVocabulary.set(sense.vocabularyId, list)
  }
  const definitionKeys = new Set(existingDefinitions.map(item => `${item.vocabularyId}\u0000${item.definition.trim()}`))
  const migratedDefinitions = []
  for (const vocabulary of vocabularies) {
    const vocabularySenses = sensesByVocabulary.get(vocabulary.id) || []
    for (const [index, meaning] of parseList(vocabulary.meanings).entries()) {
      if (definitionKeys.has(`${vocabulary.id}\u0000${meaning}`)) continue
      migratedDefinitions.push({
        id: randomUUID(),
        vocabularyId: vocabulary.id,
        senseId: vocabularySenses[Math.min(index, vocabularySenses.length - 1)]?.id,
        language: 'zh',
        dictionaryName: '旧数据迁移',
        definition: meaning,
        sortOrder: 0,
      })
    }
  }
  if (migratedDefinitions.length > 0) await prisma.vocabularyDefinition.createMany({ data: migratedDefinitions })

  await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id, vocabulary_id,
        row_number() OVER (PARTITION BY vocabulary_id ORDER BY sort_order, created_at, id) - 1 AS definition_order
      FROM vocabulary_definitions WHERE sense_id IS NULL
    )
    UPDATE vocabulary_definitions AS definition SET sense_id = target.id
    FROM ranked CROSS JOIN LATERAL (
      SELECT id FROM vocabulary_senses WHERE vocabulary_id = ranked.vocabulary_id
      ORDER BY ABS("order" - ranked.definition_order), "order" LIMIT 1
    ) AS target WHERE definition.id = ranked.id
  `)
  await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id, "vocabularyId", COALESCE("meaningIndex", 0) AS desired_order,
        row_number() OVER (PARTITION BY "vocabularyId", COALESCE("meaningIndex", 0) ORDER BY "createdAt", id) - 1 AS link_order
      FROM "VocabularySentenceLink" WHERE "senseId" IS NULL
    )
    UPDATE "VocabularySentenceLink" AS link
    SET "senseId" = target.id, "meaningIndex" = target."order", sort_order = ranked.link_order
    FROM ranked CROSS JOIN LATERAL (
      SELECT id, "order" FROM vocabulary_senses WHERE vocabulary_id = ranked."vocabularyId"
      ORDER BY ABS("order" - ranked.desired_order), "order" LIMIT 1
    ) AS target WHERE link.id = ranked.id
  `)

  for (const kind of ['noun', 'verb', 'i_adjective', 'na_adjective', 'adverb', 'adnominal', 'other']) {
    const ids = vocabularies
      .filter(vocabulary => !vocabulary.grammarPartOfSpeech && inferPartOfSpeech(parseList(vocabulary.partsOfSpeech)) === kind)
      .map(vocabulary => vocabulary.id)
    if (ids.length > 0) await prisma.vocabulary.updateMany({ where: { id: { in: ids } }, data: { grammarPartOfSpeech: kind } })
  }
  console.log(JSON.stringify({ vocabularies: vocabularies.length, createdSenses: newSenses.length, createdDefinitions: migratedDefinitions.length }))
}

migrate().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
