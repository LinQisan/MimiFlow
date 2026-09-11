import type { Prisma } from '@prisma/client'

export const normalizeWordbookQuery = (value: string) =>
  value.normalize('NFKC').trim().slice(0, 100)

export function wordbookEntryWhere(
  userId: string,
  wordbookId: string,
  query = '',
): Prisma.WordbookVocabularyWhereInput {
  const keyword = normalizeWordbookQuery(query)
  return {
    wordbookId,
    wordbook: { userId },
    vocabulary: {
      userId,
      ...(keyword ? {
        OR: [
          ...['word', 'pronunciations', 'etymologies', 'partsOfSpeech'].map(field => ({
            [field]: { contains: keyword, mode: 'insensitive' as const },
          })),
          {
            senses: {
              some: {
                definitions: {
                  some: { definition: { contains: keyword, mode: 'insensitive' } },
                },
              },
            },
          },
        ],
      } : {}),
    },
  }
}
