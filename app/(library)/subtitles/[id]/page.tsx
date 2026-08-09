import Link from 'next/link'
// Subtitle reading route.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import MediaSubtitleEditor from './MediaSubtitleEditor'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import {
  findMediaSubtitleById,
  listVocabularyBySentenceSourceIds,
} from '@/features/subtitles/server/repository'
import {
  subtitlePayloadSchema,
  type SubtitlePayload,
} from '@/features/subtitles/domain/schema'

function formatSubtitleMeta(payload: SubtitlePayload) {
  const sourceType = payload.subtitleSourceType
  const workTitle = payload.subtitleWorkTitle
  const season = payload.subtitleSeason
  const episode = payload.subtitleEpisode
  const subtitleNoAudio = payload.subtitleNoAudio
  const dialogues = payload.dialogues
  const sourceLabel = sourceType === 'TV' ? '电视剧' : '电影'
  const episodeParts = [
    sourceLabel,
    workTitle ? `《${workTitle}》` : '',
    sourceType === 'TV' && season ? `第${season}季` : '',
    sourceType === 'TV' && episode ? `第${episode}集` : '',
  ].filter(Boolean)

  return {
    sourceType,
    sourceLabel,
    workTitle,
    season,
    episode,
    subtitleNoAudio,
    dialoguesCount: dialogues.length,
    label: episodeParts.join(' · '),
  }
}

function buildMetadataDescription(title: string, payload: SubtitlePayload) {
  const meta = formatSubtitleMeta(payload)
  const subject = meta.label || `影视字幕《${title}》`
  const audioLabel = meta.subtitleNoAudio ? '仅字幕' : '含音频'
  const countLabel =
    meta.dialoguesCount > 0 ? `，共 ${meta.dialoguesCount} 行字幕` : ''

  return `${subject} 的字幕学习页面，${audioLabel}${countLabel}，用于跟读、检索台词和整理生词。`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const row = await findMediaSubtitleById(id)

  if (!row) {
    return {
      title: '影视字幕｜MimiFlow',
      description: '影视字幕学习页面。',
    }
  }

  const payload = subtitlePayloadSchema.parse(row.contentPayload)
  const title = row.title || '影视字幕'
  const subtitleMeta = formatSubtitleMeta(payload)
  const pageTitle = subtitleMeta.label
    ? `${subtitleMeta.label}｜MimiFlow`
    : '影视字幕｜MimiFlow'
  const description = buildMetadataDescription(title, payload)

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: pageTitle,
      description,
    },
  }
}

export default async function MediaSubtitleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const row = await findMediaSubtitleById(id)
  if (!row) return notFound()

  const payload = subtitlePayloadSchema.parse(row.contentPayload)
  const { sourceType, workTitle, season, episode, subtitleNoAudio } =
    formatSubtitleMeta(payload)
  const dialogues = payload.dialogues.map((item, index) => {
    const dialogueId = item.id ?? index + 1
    return {
      id: dialogueId,
      stableId: item.stableId || `legacy-${dialogueId}`,
      text: item.text,
      start: item.start,
      end: item.end,
      note: item.note,
      favorite: item.favorite,
    }
  })

  const dialogueSourceIds = dialogues.map(item =>
    buildAudioDialogueSourceId(row.id, item.stableId),
  )
  const vocabRows = await listVocabularyBySentenceSourceIds(dialogueSourceIds)

  const initialVocabularyMetaMap = vocabRows.reduce<Record<string, VocabularyMeta>>(
    (acc, item) => {
      const word = (item.word || '').trim()
      if (!word) return acc
      acc[word] = toVocabularyMeta({
        word,
        pronunciations: item.pronunciations,
        partsOfSpeech: item.partsOfSpeech,
        meanings: item.meanings,
      })
      return acc
    },
    {},
  )
  const initialPronunciationMap = Object.entries(initialVocabularyMetaMap).reduce<
    Record<string, string>
  >((acc, [word, meta]) => {
    const pronunciation = meta.pronunciations[0]
    if (pronunciation) acc[word] = pronunciation
    return acc
  }, {})
  const initialSearchKeywordRaw = resolvedSearchParams.q
  const initialSearchKeyword = Array.isArray(initialSearchKeywordRaw)
    ? initialSearchKeywordRaw[0] || ''
    : initialSearchKeywordRaw || ''
  const lineStableIdRaw = resolvedSearchParams.lineStableId
  const initialFocusedStableId = Array.isArray(lineStableIdRaw)
    ? lineStableIdRaw[0] || ''
    : lineStableIdRaw || ''
  const metaTitle = workTitle || row.title || '未填写作品名'
  const episodeLabel =
    sourceType === 'TV'
      ? [
          season ? `第 ${season} 季` : '',
          episode ? `第 ${episode} 集` : '',
        ]
          .filter(Boolean)
          .join(' · ') || '未填写季集'
      : '电影字幕'
  const favoriteCount = dialogues.filter(item => item.favorite).length

  return (
    <main className='min-h-screen bg-[#f7f8fb] text-slate-900'>
      <div className='border-b border-slate-200 bg-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8'>
          <div className='flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between'>
            <div className='min-w-0 max-w-4xl'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-700'>
                  {sourceType === 'TV' ? '电视剧' : '电影'}
                </span>
                <span className='text-sm font-bold text-slate-500'>
                  {episodeLabel}
                </span>
              </div>
              <h1 className='mt-3 break-words text-3xl font-black tracking-tight text-slate-950 md:text-4xl'>
                {metaTitle}
              </h1>
              <p className='mt-2 text-sm font-semibold text-slate-500'>
                {row.title}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link href='/subtitles' className='ui-btn'>
                字幕库
              </Link>
              <Link href='/manage/import?type=subtitles' className='ui-btn ui-btn-primary'>
                上传字幕
              </Link>
            </div>
          </div>

          <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='rounded-lg border border-slate-200 bg-slate-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>字幕行数</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {dialogues.length}
              </p>
            </div>
            <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>收藏</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {favoriteCount}
              </p>
            </div>
            <div className='rounded-lg border border-slate-200 bg-slate-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>音频状态</p>
              <p className='mt-2 text-sm font-black text-slate-800'>
                {subtitleNoAudio ? '仅字幕' : '含音频'}
              </p>
            </div>
            <div className='rounded-lg border border-teal-200 bg-teal-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>阅读模式</p>
              <p className='mt-2 text-sm font-black text-slate-800'>
                可搜索 · 可注音 · 可复制
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className='mx-auto max-w-7xl px-4 py-5 md:px-6 lg:px-8'>
        <MediaSubtitleEditor
          materialId={row.id}
          initialTitle={row.title}
          initialDialogues={dialogues}
          initialPronunciationMap={initialPronunciationMap}
          initialVocabularyMetaMap={initialVocabularyMetaMap}
          initialSearchKeyword={initialSearchKeyword}
          initialFocusedStableId={initialFocusedStableId}
        />
      </div>
    </main>
  )
}
