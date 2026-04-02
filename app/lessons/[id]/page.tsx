import AudioPlayer from '../../../components/AudioPlayer'
import prisma from '@/lib/prisma'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabularyMeta'

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const lessonData = await prisma.lesson.findUnique({
    where: { id: id },
    include: {
      category: {
        include: {
          lessons: {
            select: {
              id: true,
              title: true,
            },
            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      },
      dialogues: {
        orderBy: {
          sequenceId: 'asc',
        },
      },
    },
  })

  if (!lessonData) {
    return (
      <div className='mt-20 text-center text-gray-500'>找不到该课</div>
    )
  }

  // 课程内前后导航
  const lessonIds = lessonData.category.lessons.map(item => item.id)
  const currentIndex = lessonIds.findIndex(id => id === lessonData.id)

  const prevId = currentIndex > 0 ? lessonIds[currentIndex - 1] : null
  const nextId =
    currentIndex < lessonIds.length - 1 ? lessonIds[currentIndex + 1] : null

  // 转换为 AudioPlayer 所需数据
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
    id: lessonData.category.id,
    name: lessonData.category.name,
    description: lessonData.category.description,
    levelId: lessonData.category.levelId,
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
  const vocabularyMetaMap = relatedVocab.reduce<
    Record<string, VocabularyMeta>
  >((acc, item) => {
    acc[item.word] = toVocabularyMeta({ ...item, word: item.word })
    return acc
  }, {})

  return (
    <main className='min-h-screen bg-gray-50'>
      <AudioPlayer
        lesson={lesson}
        lessonGroup={lessonGroup}
        prevId={prevId}
        nextId={nextId}
        vocabularyMetaMap={vocabularyMetaMap}
      />
    </main>
  )
}
