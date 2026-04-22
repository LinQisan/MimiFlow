import Link from 'next/link'
import { MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials'

type JsonRecord = Record<string, unknown>

type MediaItem = {
  id: string
  legacyId: string
  title: string
  sourceType: 'MOVIE' | 'TV'
  workTitle: string
  season: string
  episode: string
  subtitleNoAudio: boolean
  dialogues: number
  createdAt: Date
  collectionTitle: string
  href: string
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asBoolean(value: unknown) {
  return value === true
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareNumberish(left: string, right: string) {
  const leftNum = asNumber(left)
  const rightNum = asNumber(right)
  if (leftNum !== null && rightNum !== null) return leftNum - rightNum
  if (leftNum !== null) return -1
  if (rightNum !== null) return 1
  return left.localeCompare(right, 'zh-Hans-CN')
}

function normalizeGroupLabel(value: string, fallback: string) {
  const trimmed = value.trim()
  return trimmed || fallback
}

export default async function MediaSubtitlesPage() {
  const rows = await prisma.material.findMany({
    where: {
      type: MaterialType.MEDIA_SUBTITLE,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      title: true,
      type: true,
      createdAt: true,
      contentPayload: true,
      collectionMaterials: {
        take: 1,
        select: {
          collection: { select: { id: true, title: true } },
        },
      },
    },
  })

  const items = rows
    .map(row => {
      const payload = asRecord(row.contentPayload)
      const sourceType = asString(payload.subtitleSourceType)
      const workTitle = asString(payload.subtitleWorkTitle)
      const subtitleNoAudio = asBoolean(payload.subtitleNoAudio)
      const season = asString(payload.subtitleSeason)
      const episode = asString(payload.subtitleEpisode)
      const dialogues = Array.isArray(payload.dialogues)
        ? payload.dialogues.length
        : 0
      const isMedia =
        sourceType === 'MOVIE' ||
        sourceType === 'TV' ||
        subtitleNoAudio ||
        Boolean(workTitle)
      if (!isMedia) return null

      const legacyId = toLegacyMaterialId(row.id)
      return {
        id: row.id,
        legacyId,
        title: row.title,
        sourceType: sourceType === 'TV' ? 'TV' : 'MOVIE',
        workTitle,
        season,
        episode,
        subtitleNoAudio,
        dialogues,
        createdAt: row.createdAt,
        collectionTitle: row.collectionMaterials[0]?.collection.title || '未归属集合',
        href: `/media-subtitles/${legacyId}`,
      } satisfies MediaItem
    })
    .filter(Boolean) as MediaItem[]

  const tvGroups = Object.values(
    items
      .filter(item => item.sourceType === 'TV')
      .reduce<
        Record<
          string,
          {
            key: string
            workTitle: string
            items: MediaItem[]
          }
        >
      >((acc, item) => {
        const groupTitle = normalizeGroupLabel(item.workTitle, item.title)
        const key = groupTitle.toLowerCase()
        if (!acc[key]) {
          acc[key] = { key, workTitle: groupTitle, items: [] }
        }
        acc[key].items.push(item)
        return acc
      }, {}),
  )
    .map(group => {
      const seasons = Object.values(
        group.items.reduce<
          Record<
            string,
            {
              seasonLabel: string
              items: MediaItem[]
            }
          >
        >((acc, item) => {
          const seasonLabel = normalizeGroupLabel(item.season, '特别篇')
          if (!acc[seasonLabel]) {
            acc[seasonLabel] = { seasonLabel, items: [] }
          }
          acc[seasonLabel].items.push(item)
          return acc
        }, {}),
      )
        .map(seasonGroup => ({
          ...seasonGroup,
          items: seasonGroup.items.sort((a, b) => {
            const episodeCmp = compareNumberish(a.episode, b.episode)
            if (episodeCmp !== 0) return episodeCmp
            return a.createdAt.getTime() - b.createdAt.getTime()
          }),
        }))
        .sort((a, b) => compareNumberish(a.seasonLabel, b.seasonLabel))

      return {
        ...group,
        seasons,
        episodeCount: group.items.length,
        dialogueCount: group.items.reduce((sum, item) => sum + item.dialogues, 0),
        latestAt: group.items.reduce(
          (latest, item) =>
            item.createdAt.getTime() > latest.getTime() ? item.createdAt : latest,
          group.items[0]?.createdAt || new Date(0),
        ),
      }
    })
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())

  const movieGroups = Object.values(
    items
      .filter(item => item.sourceType === 'MOVIE')
      .reduce<
        Record<
          string,
          {
            key: string
            workTitle: string
            items: MediaItem[]
          }
        >
      >((acc, item) => {
        const groupTitle = normalizeGroupLabel(item.workTitle, item.title)
        const key = groupTitle.toLowerCase()
        if (!acc[key]) {
          acc[key] = { key, workTitle: groupTitle, items: [] }
        }
        acc[key].items.push(item)
        return acc
      }, {}),
  )
    .map(group => ({
      ...group,
      dialogueCount: group.items.reduce((sum, item) => sum + item.dialogues, 0),
      latestAt: group.items.reduce(
        (latest, item) =>
          item.createdAt.getTime() > latest.getTime() ? item.createdAt : latest,
        group.items[0]?.createdAt || new Date(0),
      ),
      items: group.items.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    }))
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())

  const totalDialogues = items.reduce((sum, item) => sum + item.dialogues, 0)

  return (
    <main className='min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-[11px] font-black uppercase tracking-[0.24em] text-slate-400'>
                Media Subtitles
              </p>
              <h1 className='mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl'>
                电影 / 电视剧字幕库
              </h1>
              <p className='mt-2 max-w-3xl text-sm leading-6 text-slate-500'>
                从“材料列表”切到“作品列表”。同一部电视剧会自动合拢到同一张作品卡里，再按季 / 集展开，找剧集会顺手很多。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link href='/media-subtitles/upload' className='ui-btn ui-btn-primary'>
                上传影视字幕
              </Link>
              <Link href='/' className='ui-btn'>
                回首页
              </Link>
            </div>
          </div>

          <div className='mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
            <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3'>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-slate-500'>
                电视剧作品
              </p>
              <p className='mt-1 text-2xl font-black text-slate-900'>
                {tvGroups.length}
              </p>
            </div>
            <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3'>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-slate-500'>
                电影作品
              </p>
              <p className='mt-1 text-2xl font-black text-slate-900'>
                {movieGroups.length}
              </p>
            </div>
            <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3'>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-slate-500'>
                总材料数
              </p>
              <p className='mt-1 text-2xl font-black text-slate-900'>
                {items.length}
              </p>
            </div>
            <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3'>
              <p className='text-[11px] font-semibold uppercase tracking-wider text-slate-500'>
                字幕总行数
              </p>
              <p className='mt-1 text-2xl font-black text-slate-900'>
                {totalDialogues}
              </p>
            </div>
          </div>
        </header>

        {items.length === 0 ? (
          <section className='rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500'>
            还没有影视字幕，去上传页导入第一个 `.ass` 文件吧。
          </section>
        ) : (
          <div className='grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(19rem,1fr)]'>
            <section className='rounded-3xl border border-slate-200 bg-white p-4 md:p-5'>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-lg font-black text-slate-900'>电视剧</h2>
                  <p className='text-sm text-slate-500'>
                    同一部剧自动归并，展开后直接进到具体季 / 集。
                  </p>
                </div>
                <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600'>
                  {tvGroups.length} 部剧
                </span>
              </div>

              {tvGroups.length === 0 ? (
                <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500'>
                  目前还没有电视剧字幕。
                </div>
              ) : (
                <div className='space-y-3'>
                  {tvGroups.map(group => (
                    <details
                      key={`tv-group-${group.key}`}
                      className='overflow-hidden rounded-2xl border border-slate-200 bg-white'
                      open>
                      <summary className='flex cursor-pointer list-none flex-col gap-3 bg-slate-50 px-4 py-4 marker:content-none md:flex-row md:items-center md:justify-between'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <h3 className='text-base font-black text-slate-900 md:text-lg'>
                              {group.workTitle}
                            </h3>
                            <span className='rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700'>
                              电视剧
                            </span>
                          </div>
                          <p className='mt-1 text-xs text-slate-500'>
                            {group.episodeCount} 条材料 · {group.dialogueCount} 句字幕
                          </p>
                        </div>
                        <div className='flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500'>
                          {group.seasons.map(season => (
                            <span
                              key={`season-chip-${group.key}-${season.seasonLabel}`}
                              className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>
                              第 {season.seasonLabel} 季 · {season.items.length} 集
                            </span>
                          ))}
                        </div>
                      </summary>

                      <div className='space-y-4 px-4 py-4'>
                        {group.seasons.map(season => (
                          <section key={`season-${group.key}-${season.seasonLabel}`}>
                            <div className='mb-2 flex items-center justify-between gap-2'>
                              <h4 className='text-sm font-bold text-slate-800'>
                                {season.seasonLabel === '特别篇'
                                  ? '特别篇'
                                  : `第 ${season.seasonLabel} 季`}
                              </h4>
                              <span className='text-[11px] text-slate-400'>
                                {season.items.length} 条
                              </span>
                            </div>
                            <div className='grid gap-2'>
                              {season.items.map(item => (
                                <Link
                                  key={item.id}
                                  href={item.href}
                                  className='rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50'>
                                  <div className='flex flex-wrap items-center justify-between gap-2'>
                                    <div className='min-w-0'>
                                      <p className='truncate text-sm font-bold text-slate-900'>
                                        {item.episode
                                          ? `第 ${item.episode} 集`
                                          : item.title}
                                      </p>
                                      <p className='mt-1 text-xs text-slate-500'>
                                        {item.title}
                                      </p>
                                    </div>
                                    <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                                      {item.dialogues} 句
                                    </span>
                                  </div>
                                  <p className='mt-2 text-xs text-slate-400'>
                                    集合：{item.collectionTitle} · 音频：
                                    {item.subtitleNoAudio ? '无' : '有'}
                                  </p>
                                </Link>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>

            <aside className='space-y-5'>
              <section className='rounded-3xl border border-slate-200 bg-white p-4 md:p-5'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                  <div>
                    <h2 className='text-lg font-black text-slate-900'>电影</h2>
                    <p className='text-sm text-slate-500'>
                      电影数量通常更少，保留轻量浏览。
                    </p>
                  </div>
                  <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600'>
                    {movieGroups.length} 部
                  </span>
                </div>

                {movieGroups.length === 0 ? (
                  <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500'>
                    目前还没有电影字幕。
                  </div>
                ) : (
                  <div className='space-y-3'>
                    {movieGroups.map(group => (
                      <div
                        key={`movie-group-${group.key}`}
                        className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
                        <div className='flex items-center justify-between gap-2'>
                          <h3 className='text-sm font-black text-slate-900'>
                            {group.workTitle}
                          </h3>
                          <span className='rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700'>
                            电影
                          </span>
                        </div>
                        <p className='mt-1 text-xs text-slate-500'>
                          {group.items.length} 条材料 · {group.dialogueCount} 句字幕
                        </p>

                        <div className='mt-3 space-y-2'>
                          {group.items.map(item => (
                            <Link
                              key={item.id}
                              href={item.href}
                              className='block rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:bg-slate-50'>
                              <p className='truncate text-sm font-bold text-slate-900'>
                                {item.title}
                              </p>
                              <p className='mt-1 text-xs text-slate-500'>
                                {item.dialogues} 句 · 集合：{item.collectionTitle}
                              </p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className='rounded-3xl border border-slate-200 bg-white p-4 md:p-5'>
                <h2 className='text-lg font-black text-slate-900'>使用建议</h2>
                <div className='mt-3 space-y-3 text-sm leading-6 text-slate-600'>
                  <p>
                    电视剧请统一填写同一个 `作品名`，这样系统才能自动合拢到同一张作品卡里。
                  </p>
                  <p>
                    季、集最好填写纯数字；这样页面会按自然顺序排序，不会出现 `10` 排在 `2` 前面。
                  </p>
                  <p>
                    如果历史材料的 `作品名` 写法不一致，比如中英文混用，之后可以再补一个批量重命名入口来进一步清洗。
                  </p>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
