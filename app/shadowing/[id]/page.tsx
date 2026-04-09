import AudioPlayer from '@/components/AudioPlayer/AudioPlayer'
import prisma from '@/lib/prisma'
import {
  getSpeakingByLegacyId,
  listListeningMaterialsForShadowing,
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
    materialId: lessonData.materialId,
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

  const allShadowingRows = await listListeningMaterialsForShadowing()
  const currentShadowingRow = allShadowingRows.find(item => item.id === lessonData.id)
  const sameBookRows = currentShadowingRow?.bookId
    ? allShadowingRows.filter(item => item.bookId === currentShadowingRow.bookId)
    : []

  const groupedMap = new Map<
    string,
    {
      chapterTitle: string
      isCurrentChapter: boolean
      items: { id: string; title: string }[]
    }
  >()

  if (sameBookRows.length > 0) {
    for (const row of sameBookRows) {
      const chapterKey = row.chapterId || '__unclassified__'
      const chapterTitle = row.hierarchyPath[2] || '未归类'
      const isCurrentChapter = chapterKey === (currentShadowingRow?.chapterId || '__unclassified__')
      const prev = groupedMap.get(chapterKey)
      if (prev) {
        prev.items.push({ id: row.id, title: row.title })
      } else {
        groupedMap.set(chapterKey, {
          chapterTitle,
          isCurrentChapter,
          items: [{ id: row.id, title: row.title }],
        })
      }
    }
  } else {
    for (const item of lessonData.paper.lessons) {
      const chapterKey = '__current_group__'
      const prev = groupedMap.get(chapterKey)
      if (prev) {
        prev.items.push({ id: item.id, title: item.title })
      } else {
        groupedMap.set(chapterKey, {
          chapterTitle: '当前分组',
          isCurrentChapter: true,
          items: [{ id: item.id, title: item.title }],
        })
      }
    }
  }

  const lessonSwitcherGroups = Array.from(groupedMap.entries())
    .map(([id, group]) => ({
      id,
      label: group.isCurrentChapter
        ? `当前章节 · ${group.chapterTitle}`
        : `其他章节 · ${group.chapterTitle}`,
      items: group.items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
      isCurrentChapter: group.isCurrentChapter,
    }))
    .sort((a, b) => {
      if (a.isCurrentChapter !== b.isCurrentChapter) {
        return a.isCurrentChapter ? -1 : 1
      }
      return a.label.localeCompare(b.label, 'zh-CN')
    })

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

  let playtimeStat: { totalSeconds: number; playedDays: number } | null = null
  try {
    playtimeStat = await prisma.materialPlaytimeStat.findUnique({
      where: {
        profileId_materialId: {
          profileId: 'default',
          materialId: lessonData.materialId,
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
        lessonSwitcher={{
          currentLessonId: lessonData.id,
          groups: lessonSwitcherGroups,
        }}
        initialTotalPlaySeconds={playtimeStat?.totalSeconds || 0}
        initialPlayedDays={playtimeStat?.playedDays || 0}
        vocabularyMetaMap={vocabularyMetaMap}
      />
    </main>
  )
}
