import AudioPlayer from '@/components/AudioPlayer/AudioPlayer'
import prisma from '@/lib/prisma'
import {
  getSpeakingByLegacyId,
} from '@/lib/repositories/materials.repo'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabularyMeta'

export default async function ShadowingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lessonData = await getSpeakingByLegacyId(id)

  if (!lessonData) {
    return <div className='mt-20 text-center text-gray-500'>找不到该跟读材料</div>
  }

  const lesson = {
    id: lessonData.id,
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

  const dialogueIds = lessonData.dialogues.map(item => String(item.id))
  const relatedVocab = await prisma.vocabulary.findMany({
    where: {
      sentenceLinks: {
        some: {
          sentence: {
            sourceType: 'AUDIO_DIALOGUE',
            sourceId: { in: dialogueIds },
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

  return (
    <main className='min-h-screen bg-slate-50'>
      <AudioPlayer
        lesson={lesson}
        lessonGroup={lessonGroup}
        prevId={lessonData.prevId}
        nextId={lessonData.nextId}
        vocabularyMetaMap={vocabularyMetaMap}
      />
    </main>
  )
}
