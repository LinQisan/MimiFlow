import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import MediaSubtitleEditor from './MediaSubtitleEditor'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { buildAudioDialogueSourceIdCandidates } from '@/utils/audioDialogue/sourceId'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function asBoolean(value: unknown) {
  return value === true
}

function formatSubtitleMeta(payload: JsonRecord) {
  const sourceType = asString(payload.subtitleSourceType) === 'TV' ? 'TV' : 'MOVIE'
  const workTitle = asString(payload.subtitleWorkTitle)
  const season = asString(payload.subtitleSeason)
  const episode = asString(payload.subtitleEpisode)
  const subtitleNoAudio = asBoolean(payload.subtitleNoAudio)
  const dialogues = Array.isArray(payload.dialogues) ? payload.dialogues : []
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

function buildMetadataDescription(title: string, payload: JsonRecord) {
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
  const row = await prisma.material.findFirst({
    where: {
      type: MaterialType.MEDIA_SUBTITLE,
      id: { endsWith: `:${id}` },
    },
    select: {
      title: true,
      contentPayload: true,
    },
  })

  if (!row) {
    return {
      title: '影视字幕｜MimiFlow',
      description: '影视字幕学习页面。',
    }
  }

  const payload = asRecord(row.contentPayload)
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
  const row = await prisma.material.findFirst({
    where: {
      type: MaterialType.MEDIA_SUBTITLE,
      id: { endsWith: `:${id}` },
    },
    select: {
      id: true,
      title: true,
      contentPayload: true,
    },
  })
  if (!row) return notFound()

  const payload = asRecord(row.contentPayload)
  const { sourceType, workTitle, season, episode, subtitleNoAudio } =
    formatSubtitleMeta(payload)
  const dialogues = Array.isArray(payload.dialogues)
    ? payload.dialogues.map((item, index) => {
        const rec = asRecord(item)
        return {
          id: asNumber(rec.id, index + 1),
          stableId:
            asString(rec.stableId) || `legacy-${asNumber(rec.id, index + 1)}`,
          text: asString(rec.text),
          start: asNumber(rec.start),
          end: asNumber(rec.end),
          note: asString(rec.note),
          favorite: asBoolean(rec.favorite),
        }
      })
    : []

  const dialogueSourceIds = dialogues.flatMap(item =>
    buildAudioDialogueSourceIdCandidates(row.id, item.stableId, item.id),
  )
  const vocabRows =
    dialogueSourceIds.length > 0
      ? await prisma.vocabulary.findMany({
          where: {
            sentenceLinks: {
              some: {
                sentence: {
                  sourceType: { in: ['MEDIA_SUBTITLE_LINE', 'AUDIO_DIALOGUE'] },
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
      : []

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

  return (
    <main className='min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-5xl space-y-4'>
        <header className='rounded-3xl border border-slate-200 bg-white p-4 md:p-6'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h1 className='text-2xl font-black text-slate-900'>{row.title}</h1>
              <p className='mt-1 text-sm text-slate-600'>
                {sourceType === 'TV' ? '电视剧' : '电影'} · {workTitle || '未填写作品名'}
                {sourceType === 'TV' && season ? ` · 第${season}季` : ''}
                {sourceType === 'TV' && episode ? ` · 第${episode}集` : ''}
              </p>
              <p className='mt-1 text-xs text-slate-500'>
                音频：{subtitleNoAudio ? '无音频（仅字幕）' : '有音频'}
              </p>
            </div>
            <Link href='/media-subtitles' className='ui-btn'>
              返回影视字幕
            </Link>
          </div>
        </header>

        <MediaSubtitleEditor
          legacyId={id}
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
