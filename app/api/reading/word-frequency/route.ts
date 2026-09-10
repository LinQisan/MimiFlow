import { buildReadingFrequencyMaterials } from '@/features/reading/server/word-frequency'
import { getPaperWordbookDistribution } from '@/features/practice/server/paper-wordbook-distribution'
import { mergeWordFrequencyRows } from '@/modules/language/domain/sudachi'

export async function GET() {
  const materials = await buildReadingFrequencyMaterials()
  const rows = mergeWordFrequencyRows(materials.map(material => material.rows))
  return Response.json(
    {
      materials,
      wordbookDistribution: await getPaperWordbookDistribution(
        rows.map(row => row.word),
      ),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
