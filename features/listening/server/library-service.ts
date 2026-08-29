import 'server-only'

import {
  listListeningLessonsForShadowing,
  listListeningMaterialsForShadowing,
} from '@/lib/repositories/materials'
import {
  getListeningStudySummary,
  listCollectionsByTypes,
} from '@/features/listening/server/repository'

export async function getListeningLibrarySource() {
  const [speakingRows, listeningRows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
    listListeningLessonsForShadowing(),
    listCollectionsByTypes(['BOOK', 'CHAPTER']),
  ])
  const summary = await getListeningStudySummary(
    [...speakingRows, ...listeningRows].map(item => item.materialId),
  )
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
