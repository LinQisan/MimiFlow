'use client'

import {
  JLPT_LEVELS,
  isJlptVisibleWithHiddenLevels,
  normalizeWordbookHighlightWord,
  type JlptLevel,
} from '@/features/reading/domain/wordbook-highlight-groups'

type HighlightGroup = {
  id: string
  label: string
  words: string[]
  canonicalWords?: string[]
  jlptByWord?: Record<string, string[]>
}

const LEVEL_STRONG_CLASSES: Record<JlptLevel, string> = {
  N5: 'bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  N4: 'bg-lime-100 text-lime-900 ring-lime-300 hover:bg-lime-200 dark:bg-lime-950 dark:text-lime-200 dark:ring-lime-700',
  N3: 'bg-amber-200 text-amber-950 ring-amber-300 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100 dark:ring-amber-700',
  N2: 'bg-orange-600 text-white ring-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:ring-orange-600',
  N1: 'bg-red-900 text-white ring-red-900 hover:bg-red-950 dark:bg-red-900 dark:ring-red-700',
}

const hiddenClass =
  'border border-dashed border-slate-200 bg-transparent text-slate-400 opacity-65 hover:bg-white hover:opacity-100 dark:border-slate-700 dark:hover:bg-slate-900'

const neutralClass =
  'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'

const uniqueWordsForCount = (group: HighlightGroup) =>
  Array.from(
    new Set(
      (group.canonicalWords?.length ? group.canonicalWords : group.words)
        .map(normalizeWordbookHighlightWord)
        .filter(Boolean),
    ),
  )

const levelsForWord = (group: HighlightGroup, word: string) =>
  group.jlptByWord?.[word] ||
  group.jlptByWord?.[normalizeWordbookHighlightWord(word)] ||
  []

export default function WordbookHighlightSelector({
  groups,
  hiddenWordbookIds,
  onVisibilityChange,
  hiddenJlptLevels = new Set<JlptLevel>(),
  onJlptVisibilityChange,
  onAllVisibilityChange,
  title = '单词书高亮',
}: {
  groups: HighlightGroup[]
  hiddenWordbookIds: Set<string>
  onVisibilityChange: (wordbookIds: string[], visible: boolean) => void
  hiddenJlptLevels?: Set<JlptLevel>
  onJlptVisibilityChange?: (levels: JlptLevel[], visible: boolean) => void
  onAllVisibilityChange?: (visible: boolean) => void
  title?: string
}) {
  const allWordbookIds = Array.from(new Set(groups.map(group => group.id)))
  const hasJlptData = groups.some(group =>
    uniqueWordsForCount(group).some(word => levelsForWord(group, word).length > 0),
  )
  const allVisible =
    allWordbookIds.every(id => !hiddenWordbookIds.has(id)) &&
    (!hasJlptData || hiddenJlptLevels.size === 0)

  const visibleSourceGroups = groups.filter(
    group => !hiddenWordbookIds.has(group.id),
  )
  const uniqueWordLevels = new Map<string, Set<string>>()
  visibleSourceGroups.forEach(group => {
    uniqueWordsForCount(group).forEach(word => {
      const key = normalizeWordbookHighlightWord(word)
      const levels = uniqueWordLevels.get(key) || new Set<string>()
      levelsForWord(group, word).forEach(level => levels.add(level))
      uniqueWordLevels.set(key, levels)
    })
  })
  const jlptCounts = Object.fromEntries(
    JLPT_LEVELS.map(level => [
      level,
      [...uniqueWordLevels.values()].filter(levels => levels.has(level)).length,
    ]),
  ) as Record<JlptLevel, number>

  const toggleAll = (visible: boolean) => {
    if (onAllVisibilityChange) {
      onAllVisibilityChange(visible)
      return
    }
    onVisibilityChange(allWordbookIds, visible)
    if (hasJlptData) onJlptVisibilityChange?.([...JLPT_LEVELS], visible)
  }

  return (
    <div role='region' className='py-2' aria-label={`${title}范围`}>
      <div className='flex flex-wrap items-center gap-1.5'>
        {groups.map(group => {
          const hidden = hiddenWordbookIds.has(group.id)
          const matchingCount = uniqueWordsForCount(group).filter(word =>
            isJlptVisibleWithHiddenLevels(
              levelsForWord(group, word),
              hiddenJlptLevels,
            ),
          ).length
          return (
            <button
              key={group.id}
              type='button'
              aria-pressed={!hidden}
              onClick={() => onVisibilityChange([group.id], hidden)}
              title={`${hidden ? '显示' : '隐藏'} ${group.label}`}
              className={`flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-left transition ${
                hidden ? hiddenClass : neutralClass
              }`}>
              <span className='text-xs font-semibold'>{group.label}</span>
              <span className='text-[10px] tabular-nums opacity-60'>
                {matchingCount}
              </span>
            </button>
          )
        })}
        <button
          type='button'
          onClick={() => toggleAll(!allVisible)}
          className='ml-auto min-h-9 px-2 text-[11px] font-medium text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-200'>
          {allVisible ? '全部隐藏' : '全部显示'}
        </button>
      </div>

      {hasJlptData ? (
        <div className='mt-2 flex flex-wrap items-center gap-1.5'>
          <span className='mr-1 text-[11px] font-semibold text-slate-400'>JLPT</span>
          {JLPT_LEVELS.map(level => {
            const hidden = hiddenJlptLevels.has(level)
            return (
              <button
                key={level}
                type='button'
                aria-pressed={!hidden}
                onClick={() => onJlptVisibilityChange?.([level], hidden)}
                title={`${hidden ? '显示' : '隐藏'} ${level} 词汇`}
                className={`flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-left text-xs font-semibold ring-1 ring-inset transition ${
                  hidden ? hiddenClass : LEVEL_STRONG_CLASSES[level]
                }`}>
                <span>{level}</span>
                <span className='text-[10px] tabular-nums opacity-70'>
                  {jlptCounts[level]}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
