import { Prisma } from '@prisma/client'
import { planImportedWordbookOrder } from './entry-order.ts'

async function persistWordbookEntryPositions(
  tx: Prisma.TransactionClient,
  userId: string,
  wordbookId: string,
  entries: Array<{ vocabularyId: string; sortOrder: number }>,
) {
  if (entries.length === 0) return
  await tx.$executeRaw(Prisma.sql`
    UPDATE wordbook_vocabularies AS entry
    SET sort_order = incoming.position
    FROM jsonb_to_recordset(${JSON.stringify(entries.map(entry => ({ id: entry.vocabularyId, position: entry.sortOrder })))}::jsonb)
      AS incoming(id text, position int), wordbooks AS book, "Vocabulary" AS vocabulary
    WHERE entry.vocabulary_id = incoming.id
      AND entry.wordbook_id = ${wordbookId}
      AND book.id = entry.wordbook_id AND book.user_id = ${userId}
      AND vocabulary.id = entry.vocabulary_id AND vocabulary.user_id = ${userId}
  `)
}

/** Persist a complete authored order in one write. */
export async function persistWordbookEntryOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  wordbookId: string,
  vocabularyIds: string[],
) {
  const uniqueIds = [...new Set(vocabularyIds)]
  if (uniqueIds.length !== vocabularyIds.length) {
    throw new Error('词表排序中包含重复词条')
  }
  await persistWordbookEntryPositions(
    tx,
    userId,
    wordbookId,
    uniqueIds.map((vocabularyId, sortOrder) => ({ vocabularyId, sortOrder })),
  )
}

/** Runs inside the import transaction after membership links are created. */
export async function persistImportedWordbookOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  wordbookId: string,
  vocabularyIds: string[],
) {
  if (vocabularyIds.length === 0) return
  const existing = await tx.wordbookVocabulary.findMany({
    where: { wordbookId, wordbook: { userId } },
    select: { vocabularyId: true, sortOrder: true },
  })
  const ordered = planImportedWordbookOrder(vocabularyIds, existing)
  // One update for the whole batch, including reused vocabulary records.
  await persistWordbookEntryPositions(tx, userId, wordbookId, ordered)
}
