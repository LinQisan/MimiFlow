import { Prisma, type SourceType } from '@prisma/client'

export type VocabularyPageScope = {
  wordbookFilter: string
  seriesFilter: string
  tagFilter: string
  keyword: string
}

export type VocabularyGroupPageInput = VocabularyPageScope & {
  groupFilter: string
  posFilter: string
  page: number
  pageSize: number
  focusId: string
}

export type VocabularyGroupPageRow = {
  pageGroups: Array<{ word: string }>
  totals: Array<{ groupName: string; count: number }>
  availablePosFilters: string[]
  posFilter: string
  totalCount: number
  normalizedPage: number
  scannedRows: number
}

export function vocabularyPageWhere(input: VocabularyPageScope): Prisma.VocabularyWhereInput {
  const wordbooks: Prisma.VocabularyWhereInput = input.wordbookFilter === 'all'
    ? {}
    : input.wordbookFilter === 'none'
      ? { wordbooks: { none: { wordbook: { NOT: { id: { startsWith: 'legacy-' } } } } } }
      : input.seriesFilter
        ? { wordbooks: { some: { wordbook: { seriesId: input.seriesFilter } } } }
        : { wordbooks: { some: { wordbookId: input.wordbookFilter } } }
  return {
    AND: [
      wordbooks,
      ...(input.tagFilter === 'all' ? [] : [{ tags: { some: { tag: { name: input.tagFilter } } } }]),
      ...(input.keyword ? [{ OR: [
        { word: { contains: input.keyword } },
        { pronunciations: { contains: input.keyword } },
        { etymologies: { contains: input.keyword } },
        { meanings: { contains: input.keyword } },
      ] }] : []),
    ],
  }
}

function scopeSql(userId: string, input: VocabularyPageScope) {
  const clauses = [Prisma.sql`v.user_id = ${userId}`]
  if (input.wordbookFilter !== 'all') {
    const needsWordbook = input.wordbookFilter === 'none' || Boolean(input.seriesFilter)
    const membership = Prisma.sql`
      SELECT wv.vocabulary_id FROM wordbook_vocabularies wv
      ${needsWordbook ? Prisma.sql`LEFT JOIN wordbooks w ON w.id = wv.wordbook_id` : Prisma.empty}
      WHERE ${input.wordbookFilter === 'none'
        ? Prisma.sql`w.id NOT LIKE 'legacy-%'`
        : input.seriesFilter
          ? Prisma.sql`w.series_id = ${input.seriesFilter}`
          : Prisma.sql`wv.wordbook_id = ${input.wordbookFilter}`}
        ${needsWordbook ? Prisma.sql`AND w.id IS NOT NULL` : Prisma.empty}
        AND wv.vocabulary_id = v.id AND wv.vocabulary_id IS NOT NULL`
    clauses.push(input.wordbookFilter === 'none'
      ? Prisma.sql`NOT EXISTS (${membership})`
      : Prisma.sql`EXISTS (${membership})`)
  }
  if (input.tagFilter !== 'all') {
    clauses.push(Prisma.sql`EXISTS (
      SELECT tv."vocabularyId" FROM "VocabularyTagOnVocabulary" tv LEFT JOIN "VocabularyTag" t ON t.id = tv."tagId"
      WHERE t.name = ${input.tagFilter} AND t.id IS NOT NULL
        AND tv."vocabularyId" = v.id AND tv."vocabularyId" IS NOT NULL
    )`)
  }
  if (input.keyword) {
    // Match Prisma contains, including its existing LIKE wildcard semantics.
    const pattern = `%${input.keyword}%`
    clauses.push(Prisma.sql`(v.word LIKE ${pattern} OR v.pronunciations LIKE ${pattern} OR v.etymologies LIKE ${pattern} OR v.meanings LIKE ${pattern})`)
  }
  return Prisma.join(clauses, ' AND ')
}

// All current source types are Japanese sources in the shared language helper.
// A new enum member must revisit this assumption instead of silently classifying it.
const japaneseSources = {
  AUDIO_DIALOGUE: true,
  MEDIA_SUBTITLE_LINE: true,
  ARTICLE_TEXT: true,
  QUIZ_QUESTION: true,
} satisfies Record<SourceType, true>

export const vocabularySqlSourceTypes = Object.keys(japaneseSources) as SourceType[]

export function vocabularyGroupPageSql(
  userId: string,
  input: VocabularyGroupPageInput,
  posDictionary: Array<{ raw: string | null; options: string[] }>,
  languageGroups: { kana: string; hangul: string; han: string; cyrillic: string; other: string },
) {
  const matchingRawValues = posDictionary
    .filter(row => row.options.includes(input.posFilter) && row.raw !== null)
    .map(row => row.raw as string)
  const matchesPos = matchingRawValues.length
    ? Prisma.sql`k."partsOfSpeech" IN (${Prisma.join(matchingRawValues)})`
    : Prisma.sql`false`
  const availableOptions = input.groupFilter
    ? Prisma.sql`
      SELECT DISTINCT unnest(d.options) AS value FROM dictionary d
      WHERE d.raw IN (
        SELECT k."partsOfSpeech" FROM keyed k JOIN named g ON g.key = k.key
        WHERE g.group_name = ${input.groupFilter}
      )`
    : Prisma.sql`SELECT DISTINCT unnest(d.options) AS value FROM dictionary d`
  return Prisma.sql`
    WITH ordered AS MATERIALIZED (
      SELECT v.id, v.word, v.normalized_word, v.pronunciations, v."partsOfSpeech", v."sourceType"::text
      FROM "Vocabulary" v WHERE ${scopeSql(userId, input)}
      ORDER BY v."createdAt" DESC
    ), keyed AS MATERIALIZED (
      SELECT o.*, row_number() OVER () AS ordinal,
        o.normalized_word COLLATE "C" AS key,
        CASE
          WHEN o.word COLLATE "C" ~ ${'[\u3040-\u30ff]'} THEN ${languageGroups.kana}
          WHEN o.word COLLATE "C" ~ ${'[\uac00-\ud7af]'} THEN ${languageGroups.hangul}
          WHEN o.word COLLATE "C" ~ ${'[\u4e00-\u9fff]'} THEN ${languageGroups.han}
          WHEN o.word COLLATE "C" ~ ${'[\u0400-\u04ff]'} THEN ${languageGroups.cyrillic}
          ELSE ${languageGroups.other}
        END AS group_name
      FROM ordered o
    ), dictionary AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(posDictionary)}::jsonb) AS d(raw text, options text[])
    ), named AS (
      SELECT DISTINCT ON (k.key) k.key, k.ordinal, k.word, k.group_name,
        ${input.focusId ? Prisma.sql`bool_or(k.id = ${input.focusId}) OVER (PARTITION BY k.key)` : Prisma.sql`false`} AS focused,
        ${matchingRawValues.length ? Prisma.sql`bool_or(${matchesPos}) OVER (PARTITION BY k.key)` : Prisma.sql`false`} AS matches_pos
      FROM keyed k ORDER BY k.key, k.ordinal
    ), available AS MATERIALIZED (
      ${availableOptions}
    ), effective AS (
      SELECT CASE WHEN EXISTS (SELECT 1 FROM available WHERE value = ${input.posFilter})
        THEN ${input.posFilter} ELSE 'all' END AS pos
    ), filtered AS MATERIALIZED (
      SELECT g.* FROM named g CROSS JOIN effective e WHERE e.pos = 'all' OR g.matches_pos
    ), totals AS (
      SELECT group_name, count(*)::int AS count, min(ordinal) AS ordinal FROM filtered GROUP BY group_name
    ), visible AS MATERIALIZED (
      SELECT word, focused, row_number() OVER (ORDER BY ordinal) AS position
      FROM filtered WHERE (${input.groupFilter} = '' OR group_name = ${input.groupFilter})
    ), pagination AS (
      SELECT count(*)::int AS total,
        COALESCE(((max(position) FILTER (WHERE focused) - 1) / ${input.pageSize})::int + 1,
          least(${Math.min(input.page, 2_147_483_647)}::int, greatest(1, ceil(count(*)::numeric / ${input.pageSize})::int))) AS page
      FROM visible
    )
    SELECT
      COALESCE((SELECT json_agg(json_build_object('word', v.word) ORDER BY v.position)
        FROM visible v WHERE v.position > (p.page - 1)::bigint * ${input.pageSize}
          AND v.position <= p.page::bigint * ${input.pageSize}), '[]'::json) AS "pageGroups",
      COALESCE((SELECT json_agg(json_build_object('groupName', t.group_name, 'count', t.count) ORDER BY t.ordinal)
        FROM totals t), '[]'::json) AS totals,
      ARRAY(SELECT value FROM available) AS "availablePosFilters",
      (SELECT pos FROM effective) AS "posFilter", p.total AS "totalCount", p.page AS "normalizedPage",
      (SELECT count(*)::int FROM ordered) AS "scannedRows"
    FROM pagination p
  `
}
