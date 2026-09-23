import 'server-only'

import { unstable_cache } from 'next/cache'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { getVocabularyPartOfSpeechFilterOptions } from '@/utils/vocabulary/partOfSpeech'
import { resolveVocabularyGroupName } from '../domain/language'
import { VOCABULARY_GROUPS_CACHE_TAG } from './repository'
import {
  vocabularyGroupPageSql,
  vocabularyPageWhere,
  type VocabularyGroupPageInput,
  type VocabularyGroupPageRow,
} from './group-page-query'

async function queryVocabularyPageGroups(userId: string, input: VocabularyGroupPageInput) {
  // Parse authored JSON/aliases once per distinct value, using the same domain
  // helpers as the UI. No vocabulary IDs/readings cross the boundary here.
  const values = await prisma.vocabulary.groupBy({
    by: ['partsOfSpeech'],
    where: { AND: [{ OR: [{ userId }, { wordbooks: { some: {} } }] }, vocabularyPageWhere(input)] },
  })
  const dictionary = values.map(row => ({
    raw: row.partsOfSpeech,
    options: getVocabularyPartOfSpeechFilterOptions(parseJsonStringList(row.partsOfSpeech)),
  }))
  const groupName = (word: string) => resolveVocabularyGroupName({ word, sourceType: 'ARTICLE_TEXT' })
  const query = vocabularyGroupPageSql(userId, input, dictionary, {
    kana: groupName('あ'), hangul: groupName('한'), han: groupName('中'),
    cyrillic: groupName('я'), other: groupName('a'),
  })
  const [result] = await prisma.$queryRaw<VocabularyGroupPageRow[]>(query)
  return { ...result, dictionaryRows: values.length }
}

// Keep the existing groups-cache TTL and write invalidation contract, but cache
// only aggregates and page words, never the full user vocabulary summary list.
const getCachedVocabularyPageGroups = unstable_cache(
  queryVocabularyPageGroups,
  ['vocabulary-group-page-v3-book-order'],
  { tags: [VOCABULARY_GROUPS_CACHE_TAG], revalidate: 300 },
)

export async function listVocabularyPageGroups(input: VocabularyGroupPageInput) {
  const userId = await getCurrentUserId()
  const result = await getCachedVocabularyPageGroups(userId, input)
  const groupedTotals = Object.fromEntries(result.totals.map(row => [row.groupName, row.count]))
  const availablePosFilters = result.availablePosFilters.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  return { ...result, groupedTotals, availablePosFilters }
}
