'use client'

import type { VocabItem, VocabularyRelationItem } from '@/modules/knowledge/vocabulary/types'
import { VocabularyRelationDetails } from '@/modules/knowledge/vocabulary/components/VocabularyEntryEditor'

export function SpeakerIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden='true'
      className={className}
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={1.8}
      viewBox='0 0 24 24'>
      <path d='M11 5 6.5 8.5H3.75a.75.75 0 0 0-.75.75v5.5c0 .41.34.75.75.75H6.5L11 19V5Z' />
      <path d='M15 9.25a4 4 0 0 1 0 5.5' />
      <path d='M17.75 6.5a7.75 7.75 0 0 1 0 11' />
    </svg>
  )
}

export function VocabularyReadingAudioButtons({
  audios,
  onPlay,
  compact = false,
}: {
  audios?: Array<{ reading: string; audioFile: string }>
  onPlay: (audioFile: string) => void
  compact?: boolean
}) {
  if (!audios?.length) return null
  const showReading = audios.length > 1

  return (
    <div
      className={compact ? 'flex max-w-44 flex-wrap justify-end gap-1' : 'flex flex-wrap justify-center gap-2'}
      aria-label={showReading ? '分别播放读音' : '播放发音'}
    >
      {audios.map(audio => (
        <button
          key={`${audio.reading}-${audio.audioFile}`}
          type='button'
          className={`inline-flex shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-stone-100 hover:text-slate-950 active:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:active:bg-slate-700 ${
            compact ? 'h-8' : 'h-10'
          } ${showReading ? 'gap-1.5 px-3 text-sm font-medium font-word-ja' : compact ? 'w-8' : 'w-10'}`}
          aria-label={`播放读音 ${audio.reading}`}
          title={`播放读音 ${audio.reading}`}
          onClick={event => {
            event.stopPropagation()
            onPlay(audio.audioFile)
          }}
        >
          <SpeakerIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          {showReading ? <span lang='ja'>{audio.reading}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function VocabularyRelationsSection({
  vocabulary,
  showPronunciation,
  className = '',
  editing = false,
  onChange,
  onAdd,
}: {
  vocabulary: VocabItem
  showPronunciation: boolean
  className?: string
  editing?: boolean
  onChange?: (relations: VocabularyRelationItem[]) => void
  onAdd?: (type: VocabularyRelationItem['type']) => void
}) {
  const seen = new Set<string>()
  const relations = (vocabulary.senses || []).flatMap(sense => sense.relations).filter(relation => {
    if (seen.has(relation.id)) return false
    seen.add(relation.id)
    return true
  })

  if (relations.length === 0 && !editing) return null

  return (
    <section
      aria-label='関連語彙'
      className={`vocab-flat-section ${className} border-t border-slate-200 pt-5`}>
      <h4 className='mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-400'>
        関連語彙
      </h4>
      <VocabularyRelationDetails
        relations={relations}
        sourceWord={vocabulary.word}
        showPronunciation={showPronunciation}
        editing={editing}
        onChange={onChange}
        onAdd={onAdd}
      />
    </section>
  )
}

