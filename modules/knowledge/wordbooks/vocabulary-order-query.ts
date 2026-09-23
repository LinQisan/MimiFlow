import { Prisma } from '@prisma/client'

/** One batched rank per vocabulary; shared words belong to their first book. */
export function wordbookVocabularyOrderSql(seriesId = '') {
  return Prisma.sql`
    SELECT vocabulary_id, min(position) AS position FROM (
      SELECT entry.vocabulary_id, row_number() OVER (ORDER BY
        series."sortOrder", series."createdAt", series.id,
        book."sortOrder", book."createdAt", book.id,
        entry.sort_order, vocabulary."createdAt", vocabulary.id
      ) AS position
      FROM wordbook_vocabularies entry
      JOIN wordbooks book ON book.id = entry.wordbook_id
      JOIN wordbook_series series ON series.id = book.series_id
      JOIN "Vocabulary" vocabulary ON vocabulary.id = entry.vocabulary_id
      WHERE ${seriesId ? Prisma.sql`series.id = ${seriesId}` : Prisma.sql`TRUE`}
    ) ranked GROUP BY vocabulary_id
  `
}
