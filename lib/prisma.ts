import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { revalidateTag } from 'next/cache'

// Models whose writes change the vocabulary-groups cache (tab counts and
// group membership on /vocabulary). The tag must stay identical to
// VOCABULARY_GROUPS_CACHE_TAG in
// modules/knowledge/vocabulary/server/repository.ts.
const VOCABULARY_GROUPS_WRITE_MODELS = new Set([
  'Vocabulary',
  'WordbookVocabulary',
])
const VOCABULARY_GROUPS_WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
])

const bustVocabularyGroupsCache = () => {
  try {
    // Same tag as the scattered explicit calls; tag busts are idempotent.
    revalidateTag('vocabulary-groups', 'max')
  } catch {
    // Non-request contexts (one-off scripts, build): the 300s TTL on the
    // cached query bounds staleness instead.
  }
}

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          if (
            typeof model === 'string' &&
            VOCABULARY_GROUPS_WRITE_MODELS.has(model) &&
            VOCABULARY_GROUPS_WRITE_OPERATIONS.has(operation)
          ) {
            bustVocabularyGroupsCache()
          }
          return result
        },
      },
    },
  })

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}
const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
