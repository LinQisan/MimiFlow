'use client'

import WordPronunciation from '@/components/WordPronunciation'
import { inferContextualPos, posBadgeClass } from '@/utils/posTagger'

export type WordMetaEntry = {
  word: string
  pronunciation?: string
  pronunciations?: string[]
  partsOfSpeech?: string[]
  meanings?: string[]
}

export default function WordMetaPanel({
  entries,
  showPronunciation,
  showMeaning,
  enableMeaningMatch = false,
  matchedMeaningMap = {},
  onMatchedMeaningChange,
  contextSentence = '',
  className = '',
}: {
  entries: WordMetaEntry[]
  showPronunciation: boolean
  showMeaning: boolean
  enableMeaningMatch?: boolean
  matchedMeaningMap?: Record<string, number>
  onMatchedMeaningChange?: (word: string, meaningIndex: number) => void
  contextSentence?: string
  className?: string
}) {
  const hasAnyPos = entries.some(entry => (entry.partsOfSpeech || []).length > 0)
  if ((!showPronunciation && !showMeaning && !hasAnyPos) || entries.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {entries.map(entry => {
        const contextualPos = inferContextualPos(
          entry.word,
          contextSentence,
          entry.partsOfSpeech || [],
        )
        return (
        <div
          key={`meta-${entry.word}`}
          className='border border-gray-200 bg-gray-50 px-3 py-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <WordPronunciation
              word={entry.word}
              pronunciation={entry.pronunciation || ''}
              meanings={entry.meanings || []}
              showPronunciation={showPronunciation}
              showMeaning={showMeaning}
              wordClassName='text-sm font-bold text-indigo-700'
              hintClassName='text-[10px] font-bold text-indigo-500'
              meaningClassName='mt-1 text-[11px] font-semibold text-emerald-700'
            />
            {showPronunciation &&
              (entry.pronunciations || [])
                .slice(1)
                .map(pron => (
                  <span
                    key={`meta-${entry.word}-${pron}`}
                    className='rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600'>
                    {pron}
                  </span>
                ))}
            {contextualPos.map(pos => (
              <span
                key={`meta-${entry.word}-pos-${pos}`}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${posBadgeClass(pos)}`}>
                {pos}
              </span>
            ))}
          </div>
          {showMeaning && (entry.meanings || []).length > 0 && (
            <div className='mt-2 space-y-1.5'>
              {(entry.meanings || []).map((meaning, index) => {
                const no = index + 1
                const active = matchedMeaningMap[entry.word] === no
                return (
                  <button
                    key={`meaning-${entry.word}-${meaning}-${no}`}
                    type='button'
                    onClick={() => onMatchedMeaningChange?.(entry.word, no)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                      enableMeaningMatch
                        ? active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-white text-gray-700 hover:bg-emerald-50'
                        : 'bg-white text-gray-700'
                    }`}>
                    <span className='inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white'>
                      {no}
                    </span>
                    <span className='font-medium'>{meaning}</span>
                  </button>
                )
              })}
              {enableMeaningMatch && !matchedMeaningMap[entry.word] && (
                <p className='text-[10px] font-semibold text-rose-500'>
                  请选择本句对应释义
                </p>
              )}
            </div>
          )}
        </div>
      )})}
    </div>
  )
}
