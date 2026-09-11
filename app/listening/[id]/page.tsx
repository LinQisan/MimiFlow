// Focused listening session route.
import { notFound } from 'next/navigation'
import AudioPlayer from '@/modules/media/audio/components/AudioPlayer'
import {
  getLessonById,
  getSpeakingById,
} from '@/lib/repositories/materials'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { getListeningDetailSupport } from '@/modules/listening/server/repository'

export default async function ListeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const speakingData = await getSpeakingById(id)
  const listeningData = speakingData ? null : await getLessonById(id)
  const lessonData = speakingData || listeningData

  if (!lessonData) {
    notFound()
  }

  const currentMaterialId = lessonData.materialId

  const lesson = {
    id: lessonData.id,
    materialId: currentMaterialId,
    title: lessonData.title,
    audioFile: lessonData.audioFile,
    dialogue: lessonData.dialogues.map(item => ({
      id: item.id,
      text: item.text,
      start: item.start,
      end: item.end,
    })),
  }

  const lessonGroup = {
    id: lessonData.paper.id,
    name: lessonData.paper.name,
    description: lessonData.paper.description,
    levelId: lessonData.paper.levelId || 'collections',
  }

  const dialogueSourceIds = lessonData.dialogues.map(item =>
    buildAudioDialogueSourceId(currentMaterialId, String(item.id)),
  )
  const { relatedVocab, playtimeStat } = await getListeningDetailSupport(
    currentMaterialId,
    dialogueSourceIds,
  )

  const vocabularyMetaMap = relatedVocab.reduce<Record<string, VocabularyMeta>>(
    (acc, item) => {
      acc[item.word] = toVocabularyMeta({ ...item, word: item.word })
      return acc
    },
    {},
  )

  return (
    <main className='min-h-screen bg-slate-50'>
      <AudioPlayer
        lesson={lesson}
        lessonGroup={lessonGroup}
        prevId={lessonData.prevId}
        nextId={lessonData.nextId}
        initialTotalPlaySeconds={playtimeStat?.totalSeconds || 0}
        initialPlayedDays={playtimeStat?.playedDays || 0}
        vocabularyMetaMap={vocabularyMetaMap}
      />
    </main>
  )
}
