// Subtitle library route.
import Link from 'next/link'
import { listMediaSubtitleMaterials } from '@/features/subtitles/server/repository'
import { subtitlePayloadSchema } from '@/features/subtitles/domain/schema'

export const revalidate = 60

type MediaItem = {
  id: string
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

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

export default async function MediaSubtitlesPage() {
  const rows = await listMediaSubtitleMaterials()

  const items = rows
    .map(row => {
      const payload = subtitlePayloadSchema.parse(row.contentPayload)
      const sourceType = payload.subtitleSourceType
      const workTitle = payload.subtitleWorkTitle
      const subtitleNoAudio = payload.subtitleNoAudio
      const season = payload.subtitleSeason
      const episode = payload.subtitleEpisode
      const dialogues = payload.dialogues.length
      const isMedia =
        sourceType === 'MOVIE' ||
        sourceType === 'TV' ||
        subtitleNoAudio ||
        Boolean(workTitle)
      if (!isMedia) return null

      return {
        id: row.id,
        title: row.title,
        sourceType: sourceType === 'TV' ? 'TV' : 'MOVIE',
        workTitle,
        season,
        episode,
        subtitleNoAudio,
        dialogues,
        createdAt: row.createdAt,
        collectionTitle: row.collectionMaterials[0]?.collection.title || '未归属集合',
        href: `/subtitles/${row.id}`,
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
  const tvEpisodeCount = tvGroups.reduce(
    (sum, group) => sum + group.episodeCount,
    0,
  )
  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl'>
        <header className='border-b border-slate-200 py-4'>
          <p className='text-xs tracking-wide text-slate-500'>
            {tvGroups.length} 部电视剧 · {tvEpisodeCount} 集 · {movieGroups.length} 部电影 · {totalDialogues} 行字幕
          </p>
        </header>

        <div className='mt-5'>
          {items.length === 0 ? (
          <section className='rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500'>
            还没有影视字幕，去上传页导入第一个 `.ass` 文件吧。
          </section>
        ) : (
          <div className='min-w-0'>
            <div className='min-w-0 space-y-5'>
              <section className='min-w-0 border border-slate-200 bg-white'>
                <div className='flex flex-col gap-2 border-b border-slate-200 px-4 py-4 md:flex-row md:items-end md:justify-between'>
                  <div>
                    <h2 className='text-xl font-black text-slate-950'>电视剧</h2>
                    <p className='mt-1 text-sm text-slate-500'>
                      按作品、季、集分层，最近更新的作品排在前面。
                    </p>
                  </div>
                  <span className='text-sm font-bold text-teal-700'>
                    {tvGroups.length} 部剧 · {tvEpisodeCount} 集
                  </span>
                </div>

                {tvGroups.length === 0 ? (
                  <div className='p-8 text-center text-sm text-slate-500'>
                    目前还没有电视剧字幕。
                  </div>
                ) : (
                  <div className='divide-y divide-slate-200'>
                    {tvGroups.map(group => (
                      <details
                        key={`tv-group-${group.key}`}
                        className='group min-w-0'
                        open>
                        <summary className='flex cursor-pointer list-none flex-col gap-3 px-4 py-4 transition hover:bg-slate-50 marker:content-none md:flex-row md:items-center md:justify-between'>
                          <div className='min-w-0'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <h3 className='truncate text-lg font-black text-slate-950'>
                                {group.workTitle}
                              </h3>
                              <span className='rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700'>
                                TV
                              </span>
                            </div>
                            <p className='mt-1 text-xs text-slate-500'>
                              {group.episodeCount} 条材料 · {group.dialogueCount} 句字幕 · 最近 {formatShortDate(group.latestAt)}
                            </p>
                          </div>
                          <div className='flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600'>
                            {group.seasons.map(season => (
                              <span
                                key={`season-chip-${group.key}-${season.seasonLabel}`}
                                className='rounded border border-slate-200 bg-white px-2 py-1'>
                                {season.seasonLabel === '特别篇'
                                  ? '特别篇'
                                  : `S${season.seasonLabel}`}{' '}
                                · {season.items.length}
                              </span>
                            ))}
                          </div>
                        </summary>

                        <div className='min-w-0 bg-slate-50 px-4 py-4'>
                          <div className='space-y-4'>
                            {group.seasons.map(season => (
                              <section
                                key={`season-${group.key}-${season.seasonLabel}`}
                                className='min-w-0'>
                                <div className='mb-2 flex items-center justify-between gap-2'>
                                  <h4 className='text-sm font-black text-slate-800'>
                                    {season.seasonLabel === '特别篇'
                                      ? '特别篇'
                                      : `第 ${season.seasonLabel} 季`}
                                  </h4>
                                  <span className='text-xs font-semibold text-slate-400'>
                                    {season.items.length} 集
                                  </span>
                                </div>
                                <div className='min-w-0 divide-y divide-slate-200 border-y border-slate-200'>
                                  {season.items.map(item => (
                                    <Link
                                      key={item.id}
                                      href={item.href}
                                      className='block min-w-0 px-3 py-3 transition hover:bg-teal-50/40'>
                                      <div className='flex items-start justify-between gap-3'>
                                        <div className='min-w-0'>
                                          <p className='truncate text-sm font-black text-slate-950'>
                                            {item.episode
                                              ? `第 ${item.episode} 集`
                                              : item.title}
                                          </p>
                                          <p className='mt-1 truncate text-xs text-slate-500'>
                                            {item.title}
                                          </p>
                                        </div>
                                        <span className='shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600'>
                                          {item.dialogues}
                                        </span>
                                      </div>
                                      <p className='mt-3 truncate text-xs text-slate-400'>
                                        {item.collectionTitle} ·{' '}
                                        {item.subtitleNoAudio ? '仅字幕' : '含音频'}
                                      </p>
                                    </Link>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>

              <section className='min-w-0 border border-slate-200 bg-white'>
                <div className='flex flex-col gap-2 border-b border-slate-200 px-4 py-4 md:flex-row md:items-end md:justify-between'>
                  <div>
                    <h2 className='text-xl font-black text-slate-950'>电影</h2>
                    <p className='mt-1 text-sm text-slate-500'>
                      以作品为单位归档，同名版本会收在一起。
                    </p>
                  </div>
                  <span className='text-sm font-bold text-amber-700'>
                    {movieGroups.length} 部
                  </span>
                </div>

                {movieGroups.length === 0 ? (
                  <div className='p-8 text-center text-sm text-slate-500'>
                    目前还没有电影字幕。
                  </div>
                ) : (
                  <div className='min-w-0 divide-y divide-slate-200 border-y border-slate-200 p-4'>
                    {movieGroups.map(group => (
                      <div
                        key={`movie-group-${group.key}`}
                        className='py-4'>
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <h3 className='truncate text-base font-black text-slate-950'>
                              {group.workTitle}
                            </h3>
                            <p className='mt-1 text-xs text-slate-500'>
                              {group.items.length} 条材料 · {group.dialogueCount} 句字幕
                            </p>
                          </div>
                          <span className='rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700'>
                            MOVIE
                          </span>
                        </div>

                        <div className='mt-3 space-y-2'>
                          {group.items.map(item => (
                            <Link
                              key={item.id}
                              href={item.href}
                              className='block border-t border-slate-200 px-1 py-2 transition hover:bg-amber-50/50'>
                              <p className='truncate text-sm font-bold text-slate-900'>
                                {item.title}
                              </p>
                              <p className='mt-1 truncate text-xs text-slate-500'>
                                {item.dialogues} 句 · {item.collectionTitle}
                              </p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

          </div>
          )}
        </div>
      </div>
    </main>
  )
}
