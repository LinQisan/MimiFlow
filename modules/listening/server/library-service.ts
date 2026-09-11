import 'server-only'

import { listListeningLibraryMaterials } from '@/lib/repositories/materials'
import {
  getListeningStudySummary,
  listListeningLibraryCollections,
} from '@/modules/listening/server/repository'

export async function getListeningLibrarySource() {
  const [[materialRows, collections], summary] = await Promise.all([
    Promise.all([
      listListeningLibraryMaterials(),
      listListeningLibraryCollections(),
    ]),
    getListeningStudySummary(),
  ])
  const speakingRows = materialRows.filter(item => item.materialType === 'SPEAKING')
  const listeningRows = materialRows.filter(item => item.materialType === 'LISTENING')
  const playtimeByMaterialId = Object.fromEntries(
    summary.stats.map(item => [item.materialId, item.totalSeconds]),
  )

  return {
    speakingRows,
    listeningRows,
    collections,
    summary,
    playtimeByMaterialId,
  }
}
