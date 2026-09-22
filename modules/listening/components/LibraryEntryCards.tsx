'use client'

import Link from 'next/link'
import styles from './LibraryEntryCards.module.css'
import DeferredDetails from '@/modules/listening/components/DeferredDetails'

export type LibraryEntryRow = {
  id: string
  title: string
  materialId: string
  totalSeconds: number
  chapterLabel?: string
}

export type LibraryEntryChapter = {
  id: string
  title: string
  rows: LibraryEntryRow[]
}

export type LibraryEntrySection = {
  key: string
  title: string
  items: LibraryEntryRow[]
}

export type LibraryEntryContentData =
  | { variant: 'book'; title: string; chapters: LibraryEntryChapter[] }
  | { variant: 'material'; row: LibraryEntryRow }
  | { variant: 'paper'; title: string; sections: LibraryEntrySection[] }

function formatPlaytimeCompact(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  const sec = safe % 60
  if (day > 0) return hour > 0 ? `${day}天${hour}小时` : `${day}天`
  if (hour > 0) return minute > 0 ? `${hour}小时${minute}分` : `${hour}小时`
  if (minute > 0) return `${minute}分钟`
  return `${sec}秒`
}

function PlaytimeLabel({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null
  return (
    <span className='shrink-0 text-[11px] font-semibold text-slate-500'>
      {formatPlaytimeCompact(seconds)}
    </span>
  )
}

function EntryRowLink({
  item,
  index,
}: {
  item: LibraryEntryRow
  index: number
}) {
  return (
    <Link
      href={`/listening/${item.id}`}
      className='group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 min-h-10 py-2 text-sm hover:bg-slate-50'>
      <span className='text-xs font-semibold tabular-nums text-slate-400'>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className='line-clamp-1 font-medium text-slate-700 group-hover:text-slate-900'>
        {item.title}
      </span>
      <PlaytimeLabel seconds={item.totalSeconds} />
    </Link>
  )
}

function ChapterScrollItem({
  chapterTitle,
  rows,
}: {
  chapterTitle: string
  rows: LibraryEntryRow[]
}) {
  return (
    <DeferredDetails
      className={`group/chapter ${styles.entry}`}
      summary={
        <summary className='flex min-h-10 cursor-pointer list-none items-center gap-2 py-1.5 marker:content-none hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-slate-500'>
        <h3 className='line-clamp-1 text-sm font-semibold tracking-tight text-slate-900'>
          {chapterTitle}
        </h3>
        <span className='flex shrink-0 items-center gap-2'>
          <span className='shrink-0 text-[11px] tabular-nums text-slate-400'>{rows.length} 条</span>
          <span
            aria-hidden
            className='inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-400 transition-transform group-open/chapter:rotate-180'>
            ⌄
          </span>
        </span>
        </summary>
      }>
      <div className='max-h-[min(28rem,70vh)] space-y-3 overflow-y-auto py-2'>
        {rows.map((item, index) => (
          <EntryRowLink key={item.id} item={item} index={index} />
        ))}
      </div>
    </DeferredDetails>
  )
}

function MaterialBookCard({
  title,
  chapters,
}: {
  title: string
  chapters: LibraryEntryChapter[]
}) {
  const totalMaterials = chapters.reduce((sum, chapter) => sum + chapter.rows.length, 0)
  return (
    <DeferredDetails
      className={`group/book w-full ${styles.entry}`}
      summary={
        <summary className='cursor-pointer list-none px-2 marker:content-none focus-visible:outline-2 focus-visible:outline-slate-500'>
          <div className='flex min-h-7 items-center gap-2'>
            <h3 className='min-w-0 text-base font-bold leading-snug tracking-tight text-slate-950'>{title}</h3>
            <span className='shrink-0 text-xs tabular-nums text-slate-500'>{totalMaterials} 条</span>
            <span aria-hidden className='inline-flex h-5 w-5 shrink-0 items-center justify-center text-xs text-slate-500 transition-transform motion-reduce:transition-none group-open/book:rotate-180'>⌄</span>
          </div>
          <p className='mt-0.5 text-[11px] text-slate-500'>{chapters.length} 个章节</p>
        </summary>
      }>
      <div className='mt-3 space-y-3 bg-slate-500/[0.025] py-2 pl-10 pr-2'>
        {chapters.map(chapter => (
          <ChapterScrollItem
            key={chapter.id}
            chapterTitle={chapter.title}
            rows={chapter.rows}
          />
        ))}
      </div>
    </DeferredDetails>
  )
}

function MaterialCard({ item }: { item: LibraryEntryRow }) {
  const chapterLabel = (item.chapterLabel || '').trim()
  const showChapter = chapterLabel && chapterLabel !== item.title.trim()
  return (
    <Link
      href={`/listening/${item.id}`}
      className='group block px-2 py-2.5 transition hover:bg-white'>
      <h3 className='line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900'>
        {showChapter ? (
          <span className='text-slate-500'>{chapterLabel} · </span>
        ) : null}
        {item.title}
      </h3>
      {item.totalSeconds > 0 && (
        <p className='mt-1 text-xs text-slate-500'>
          已听 {formatPlaytimeCompact(item.totalSeconds)}
        </p>
      )}
    </Link>
  )
}

function ListeningPaperCard({
  title,
  sections,
}: {
  title: string
  sections: LibraryEntrySection[]
}) {
  return (
    <DeferredDetails
      className={`group/book w-full ${styles.entry}`}
      summary={
        <summary className='cursor-pointer list-none px-2 marker:content-none focus-visible:outline-2 focus-visible:outline-slate-500'>
          <div className='flex min-h-7 items-center gap-2'>
            <h3 className='min-w-0 text-base font-bold leading-snug tracking-tight text-slate-950'>{title}</h3>
            <span className='shrink-0 text-xs tabular-nums text-slate-500'>{sections.reduce((sum, section) => sum + section.items.length, 0)} 条</span>
            <span aria-hidden className='inline-flex h-5 w-5 shrink-0 items-center justify-center text-xs text-slate-500 transition-transform motion-reduce:transition-none group-open/book:rotate-180'>⌄</span>
          </div>
          <p className='mt-0.5 text-[11px] text-slate-500'>{sections.length} 个问题</p>
        </summary>
      }>
      <div className='mt-3 space-y-3 bg-slate-500/[0.025] py-2 pl-10 pr-2'>
        {sections.map(section => (
          <DeferredDetails
            key={section.key}
            className={`group/section ${styles.entry}`}
            summary={<summary className='flex min-h-10 cursor-pointer list-none items-center gap-2 py-1.5 marker:content-none hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-slate-500'>
              <span className='text-sm font-semibold text-slate-900'>{section.title}</span>
              <span className='flex items-center gap-2'>
                <span className='shrink-0 text-[11px] tabular-nums text-slate-400'>{section.items.length} 条</span>
                <span aria-hidden className='inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-400 transition-transform group-open/section:rotate-180'>⌄</span>
              </span>
            </summary>}>
            <div className='max-h-[min(28rem,70vh)] space-y-3 overflow-y-auto py-2 [&>a]:border-0'>
              {section.items.map((item, index) => (
                <EntryRowLink key={item.id} item={item} index={index} />
              ))}
            </div>
          </DeferredDetails>
        ))}
      </div>
    </DeferredDetails>
  )
}

export default function LibraryEntryContent({
  data,
}: {
  data: LibraryEntryContentData
}) {
  if (data.variant === 'book') {
    return <MaterialBookCard title={data.title} chapters={data.chapters} />
  }
  if (data.variant === 'material') {
    return <MaterialCard item={data.row} />
  }
  return (
    <ListeningPaperCard
      title={data.title}
      sections={data.sections}
    />
  )
}
