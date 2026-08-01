// Focused listening session route.
import { notFound } from 'next/navigation'
import AudioPlayer from '@/components/AudioPlayer/AudioPlayer'
import prisma from '@/lib/prisma'
import {
  getLessonByLegacyId,
  getSpeakingByLegacyId,
} from '@/lib/repositories/materials'
import { buildAudioDialogueSourceIdCandidates } from '@/utils/audioDialogue/sourceId'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

export default async function ListeningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const speakingData = await getSpeakingByLegacyId(id)
  const listeningData = speakingData ? null : await getLessonByLegacyId(id)
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

  const dialogueSourceIds = lessonData.dialogues.flatMap(item =>
    buildAudioDialogueSourceIdCandidates(
      currentMaterialId,
      String(item.id),
      item.id,
    ),
  )
  const relatedVocab = await prisma.vocabulary.findMany({
    where: {
      sentenceLinks: {
        some: {
          sentence: {
            sourceType: 'AUDIO_DIALOGUE',
            sourceId: { in: dialogueSourceIds },
          },
        },
      },
    },
    select: {
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
    },
  })

  const vocabularyMetaMap = relatedVocab.reduce<Record<string, VocabularyMeta>>(
    (acc, item) => {
      acc[item.word] = toVocabularyMeta({ ...item, word: item.word })
      return acc
    },
    {},
  )

  let playtimeStat: { totalSeconds: number; playedDays: number } | null = null
  try {
    playtimeStat = await prisma.materialPlaytimeStat.findUnique({
      where: {
        profileId_materialId: {
          profileId: 'default',
          materialId: currentMaterialId,
        },
      },
      select: {
        totalSeconds: true,
        playedDays: true,
      },
    })
  } catch {
    playtimeStat = null
  }

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
