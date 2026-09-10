import 'server-only'

import { buildWordFrequency, type SudachiToken } from '@/modules/language/domain/sudachi'
import { getSudachiPronunciationMap } from '@/modules/language/server/sudachi-pronunciation'
import type { FrequencyMaterial } from '@/features/reading/ui/WordFrequencyDialog'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'
import { listReadingMaterials } from '@/lib/repositories/materials'

const extractYear = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const match = value?.match(/(?:19|20)\d{2}/)
    if (match) return match[0]
  }
  return ''
}

export async function buildReadingFrequencyMaterials(): Promise<FrequencyMaterial[]> {
  const materials = (await listReadingMaterials()).filter(
    item => !isEbookSourceKind(item.sourceKind),
  )
  const analysis = await getSudachiPronunciationMap(
    materials.map(item => item.content),
  )
  const tokensByMaterial = analysis.tokens.reduce<Map<number, SudachiToken[]>>(
    (index, token) => {
      const rows = index.get(token.textIndex) || []
      rows.push(token)
      index.set(token.textIndex, rows)
      return index
    },
    new Map(),
  )

  return materials.map((item, textIndex) => ({
    id: item.id,
    kind:
      item.sourceKind === 'NEWS'
        ? 'news'
        : item.paper?.collectionType === 'PAPER'
          ? 'exam'
          : 'article',
    year: extractYear(item.publishedDate, item.paper?.name, item.title),
    rows: buildWordFrequency(tokensByMaterial.get(textIndex) || []),
  }))
}
