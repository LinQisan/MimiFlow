import Link from 'next/link'
import WordAudioButton from '@/components/vocabulary/WordAudioButton'
import { buildWordbookEntryHref } from '@/modules/knowledge/vocabulary/domain/navigation'
import type { WordbookVocabularyItem } from '../types'

export default function WordbookEntryRow({
  item, wordbookId, position, managing, selected, removing, onToggle, onRemove,
}: {
  item: WordbookVocabularyItem
  wordbookId: string
  position: number
  managing: boolean
  selected: boolean
  removing: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <article className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto] sm:items-center ${selected ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}>
      {managing ? (
        <label className='flex min-h-10 items-center justify-center'>
          <input type='checkbox' aria-label={`选择 ${item.word}`} checked={selected} onChange={onToggle} className='h-5 w-5 accent-slate-900' />
        </label>
      ) : <span className='pt-1 text-xs tabular-nums text-slate-400'>{item.entryNumber || position}</span>}
      <div className='min-w-0'>
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
          <h2 lang='ja' className='font-word-ja break-words text-xl font-semibold text-slate-950 dark:text-slate-100'>{item.word}</h2>
          {item.pronunciations.length > 0 ? <span lang='ja' className='font-word-ja text-sm text-slate-500 dark:text-slate-400'>{item.pronunciations.join(' / ')}</span> : null}
        </div>
        <p className='mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300'>{item.meanings.join('；') || '暂无释义'}</p>
        <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400'>
          {item.partsOfSpeech.map(pos => <span key={pos}>{pos}</span>)}
          {item.jlpt ? <span className={`ui-tag ui-tag-jlpt ui-tag-jlpt-${item.jlpt.toLowerCase()}`}>{item.jlpt}</span> : null}
          {item.tags.map(tag => <span key={tag}>#{tag}</span>)}
          {item.section ? <span>{item.section}</span> : null}
          {item.page ? <span>第 {item.page} 页</span> : null}
        </div>
      </div>
      <div className='col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3'>
        <WordAudioButton audioFile={item.wordAudio} word={item.word} />
        <Link href={buildWordbookEntryHref(wordbookId, item.id)} prefetch={false} className='ui-btn' aria-label={`查看 ${item.word}`}>查看</Link>
        <Link href={buildWordbookEntryHref(wordbookId, item.id, true)} prefetch={false} className='ui-btn' aria-label={`编辑 ${item.word}`}>编辑</Link>
        {managing ? <button type='button' disabled={removing} onClick={onRemove} className='ui-btn ui-btn-danger disabled:opacity-40' aria-label={`从当前词表移出 ${item.word}`}>{removing ? '移出中…' : '移出'}</button> : null}
      </div>
    </article>
  )
}
