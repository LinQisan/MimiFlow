'use client'

import { useMemo, useReducer, type ReactNode } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'

export type ListeningLibraryEntry = {
  id: string
  kind: 'shadowing' | 'exam'
  title: string
  searchText: string
  languages: string[]
  itemCount: number
  content: ReactNode
}

type FilterKind = 'all' | ListeningLibraryEntry['kind']

type FilterState = {
  query: string
  kind: FilterKind
  language: string
}

type FilterAction =
  | { type: 'query'; value: string }
  | { type: 'kind'; value: FilterKind }
  | { type: 'language'; value: string }
  | { type: 'reset' }

function reducer(_state: FilterState, action: FilterAction): FilterState {
  if (action.type === 'reset') return { query: '', kind: 'all', language: 'all' }
  if (action.type === 'query') return { ..._state, query: action.value }
  if (action.type === 'kind') return { ..._state, kind: action.value }
  return { ..._state, language: action.value }
}

const kindLabels: Record<ListeningLibraryEntry['kind'], string> = {
  shadowing: '跟读教材',
  exam: '试卷听力',
}

export default function ListeningViewSwitcher({
  entries,
}: {
  entries: ListeningLibraryEntry[]
}) {
  const [filters, dispatch] = useReducer(reducer, { query: '', kind: 'all', language: 'all' })
  const languageOptions = useMemo(
    () => Array.from(new Set(entries.flatMap(entry => entry.languages))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [entries],
  )
  const filteredEntries = useMemo(() => {
    const query = filters.query.trim().normalize('NFKC').toLowerCase()
    return entries.filter(entry => {
      if (filters.kind !== 'all' && entry.kind !== filters.kind) return false
      if (filters.language !== 'all' && !entry.languages.includes(filters.language)) return false
      if (!query) return true
      return entry.searchText.normalize('NFKC').toLowerCase().includes(query)
    })
  }, [entries, filters])
  const hasActiveFilter = Boolean(filters.query.trim()) || filters.kind !== 'all' || filters.language !== 'all'
  const visibleItemCount = filteredEntries.reduce(
    (sum, entry) => sum + entry.itemCount,
    0,
  )
  const visibleKinds = (['shadowing', 'exam'] as const)
    .map(kind => ({
      kind,
      entries: filteredEntries.filter(entry => entry.kind === kind),
    }))
    .filter(group => group.entries.length > 0)

  return (
    <div className='grid gap-8 py-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-11'>
      <aside className='lg:sticky lg:top-24 lg:self-start'>
        <div className='rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)]'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='text-sm font-semibold text-slate-950'>筛选材料</h2>
            {hasActiveFilter ? (
              <button
                type='button'
                onClick={() => dispatch({ type: 'reset' })}
                className='text-xs font-semibold text-slate-400 transition hover:text-slate-900'>
                重置
              </button>
            ) : null}
          </div>

          <div className='mt-4 space-y-4'>
            <label className='block'>
              <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>关键词</span>
              <input
                value={filters.query}
                onChange={event => dispatch({ type: 'query', value: event.currentTarget.value })}
                placeholder='教材、章节或材料名'
                className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200'
              />
            </label>

            <label className='block'>
              <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>材料类型</span>
              <CustomSelect
                value={filters.kind}
                onChange={event => dispatch({ type: 'kind', value: event.currentTarget.value as FilterKind })}
                className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                <option value='all'>全部材料</option>
                <option value='shadowing'>跟读教材</option>
                <option value='exam'>试卷听力</option>
              </CustomSelect>
            </label>

            <label className='block'>
              <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>语言</span>
              <CustomSelect
                value={filters.language}
                onChange={event => dispatch({ type: 'language', value: event.currentTarget.value })}
                className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                <option value='all'>全部语言</option>
                {languageOptions.map(language => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </CustomSelect>
            </label>
          </div>

          <p className='mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500'>
            当前显示 <strong className='font-semibold text-slate-900'>{filteredEntries.length}</strong> 组，
            共 <strong className='font-semibold text-slate-900'>{visibleItemCount}</strong> 条材料
          </p>
        </div>
      </aside>

      <main className='min-w-0'>
        {filteredEntries.length === 0 ? (
          <section className='rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center'>
            <p className='text-lg font-semibold text-slate-950'>没有找到匹配的听力材料</p>
            <p className='mt-2 text-sm text-slate-500'>尝试缩短关键词，或者清空材料类型与语言筛选。</p>
            <button
              type='button'
              onClick={() => dispatch({ type: 'reset' })}
              className='ui-btn ui-btn-primary mt-5'>
              清空筛选
            </button>
          </section>
        ) : (
          <div className='space-y-10'>
            {visibleKinds.map(group => (
              <section key={group.kind}>
                <div className='mb-4 flex items-center gap-3'>
                  <h2 className='text-sm font-semibold text-slate-800'>{kindLabels[group.kind]}</h2>
                  <span className='h-px flex-1 bg-slate-900/10' />
                  <span className='text-xs tabular-nums text-slate-400'>{group.entries.length} 组</span>
                </div>
                <div className='space-y-3'>
                  {group.entries.map(entry => (
                    <div key={entry.id}>{entry.content}</div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
