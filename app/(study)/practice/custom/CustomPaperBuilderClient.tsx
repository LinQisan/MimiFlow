'use client'

// Custom practice builder client.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NumberStepper from '@/components/ui/NumberStepper'
import CustomSelect from '@/components/ui/CustomSelect'

type RandomTypeOption = {
  key: string
  label: string
}

type PracticeScope = 'unattempted' | 'attempted' | 'all'

type SavedPreset = {
  id: string
  name: string
  counts: Record<string, number>
  scope?: PracticeScope
  updatedAt: number
}

type Props = {
  options: ReadonlyArray<RandomTypeOption>
  languageOptions: string[]
  levelOptions: string[]
}

const STORAGE_COUNTS_KEY = 'custom_practice_counts_v1'
const STORAGE_PRESETS_KEY = 'custom_practice_presets_v1'
const STORAGE_SCOPE_KEY = 'custom_practice_scope_v1'

const defaultQuickPresets: Array<{
  title: string
  counts: Record<string, number>
}> = [
  {
    title: '听力 3 题',
    counts: { LISTENING: 3 },
  },
  {
    title: '语法 10 题',
    counts: { VOCAB_GRAMMAR: 10 },
  },
  {
    title: '综合 12 题',
    counts: { LISTENING: 3, VOCAB_GRAMMAR: 6, READING: 3 },
  },
]

const scopeOptions: Array<{
  value: PracticeScope
  label: string
  description: string
}> = [
  {
    value: 'unattempted',
    label: '未做题',
    description: '优先覆盖新题',
  },
  {
    value: 'attempted',
    label: '已做题',
    description: '复习已有记录',
  },
  {
    value: 'all',
    label: '全部题目',
    description: '不限作答记录',
  },
]

const normalizeScope = (value: unknown): PracticeScope =>
  value === 'attempted' || value === 'all' ? value : 'unattempted'

function createEmptyCounts(options: ReadonlyArray<RandomTypeOption>) {
  return options.reduce<Record<string, number>>((acc, option) => {
    acc[option.key] = 0
    return acc
  }, {})
}

function normalizeCounts(
  options: ReadonlyArray<RandomTypeOption>,
  source: Record<string, unknown>,
) {
  const base = createEmptyCounts(options)
  for (const option of options) {
    const raw = source[option.key]
    const parsed = Math.max(0, Math.min(50, Math.floor(Number(raw || 0))))
    base[option.key] = Number.isFinite(parsed) ? parsed : 0
  }
  return base
}

function toQueryFromCounts(
  counts: Record<string, number>,
  filters: { language: string; level: string; scope: PracticeScope },
) {
  const params = new URLSearchParams()
  Object.entries(counts).forEach(([key, value]) => {
    const next = Math.max(0, Math.floor(value || 0))
    if (next > 0) params.set(`count_${key}`, String(next))
  })
  if (filters.language) params.set('language', filters.language)
  if (filters.level) params.set('level', filters.level)
  params.set('scope', filters.scope)
  return params.toString()
}

export default function CustomPaperBuilderClient({
  options,
  languageOptions,
  levelOptions,
}: Props) {
  const router = useRouter()
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    createEmptyCounts(options),
  )
  const [presets, setPresets] = useState<SavedPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [errorText, setErrorText] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedScope, setSelectedScope] =
    useState<PracticeScope>('unattempted')
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    try {
      const storedCounts = localStorage.getItem(STORAGE_COUNTS_KEY)
      if (storedCounts) {
        const parsed = JSON.parse(storedCounts) as Record<string, unknown>
        setCounts(normalizeCounts(options, parsed))
      }
    } catch {
      // ignore invalid local data
    }

    try {
      const storedPresets = localStorage.getItem(STORAGE_PRESETS_KEY)
      if (storedPresets) {
        const parsed = JSON.parse(storedPresets) as SavedPreset[]
        if (Array.isArray(parsed)) {
          setPresets(
            parsed
              .filter(item => item && typeof item.name === 'string')
              .map(item => ({
                ...item,
                counts: normalizeCounts(options, item.counts || {}),
                scope: normalizeScope(item.scope),
              }))
              .sort((a, b) => b.updatedAt - a.updatedAt),
          )
        }
      }
    } catch {
      // ignore invalid local data
    }

    const storedScope = localStorage.getItem(STORAGE_SCOPE_KEY)
    if (storedScope === 'attempted' || storedScope === 'all') {
      setSelectedScope(storedScope)
    }
    setHasHydrated(true)
  }, [options])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem(STORAGE_COUNTS_KEY, JSON.stringify(counts))
  }, [counts, hasHydrated])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets))
  }, [hasHydrated, presets])

  useEffect(() => {
    if (!hasHydrated) return
    localStorage.setItem(STORAGE_SCOPE_KEY, selectedScope)
  }, [hasHydrated, selectedScope])

  const totalRequested = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + (value || 0), 0),
    [counts],
  )

  const updateCount = (key: string, value: string | number) => {
    const next = Math.max(0, Math.min(50, Math.floor(Number(value || 0))))
    setCounts(prev => ({ ...prev, [key]: Number.isFinite(next) ? next : 0 }))
    setErrorText('')
  }

  const applyCounts = (
    nextCounts: Record<string, number>,
    scope?: PracticeScope,
  ) => {
    setCounts(normalizeCounts(options, nextCounts))
    if (scope) setSelectedScope(scope)
    setErrorText('')
  }

  const handleSavePreset = () => {
    const trimmedName = presetName.trim()
    if (!trimmedName) {
      setErrorText('请输入预设名称。')
      return
    }
    if (totalRequested <= 0) {
      setErrorText('请先设置至少 1 题再保存预设。')
      return
    }

    const now = Date.now()
    setPresets(prev => {
      const existing = prev.find(item => item.name === trimmedName)
      if (existing) {
        return [
          {
            ...existing,
            counts: { ...counts },
            scope: selectedScope,
            updatedAt: now,
          },
          ...prev.filter(item => item.id !== existing.id),
        ]
      }
      return [
        {
          id: `preset-${now}`,
          name: trimmedName,
          counts: { ...counts },
          scope: selectedScope,
          updatedAt: now,
        },
        ...prev,
      ]
    })
    setPresetName('')
    setErrorText('')
  }

  const handleDeletePreset = (presetId: string) => {
    setPresets(prev => prev.filter(item => item.id !== presetId))
  }

  const handleStart = () => {
    if (totalRequested <= 0) {
      setErrorText('请至少选择 1 题。')
      return
    }
    const query = toQueryFromCounts(counts, {
      language: selectedLanguage,
      level: selectedLevel,
      scope: selectedScope,
    })
    router.push(`/practice/custom/do?${query}`)
  }

  const startLabel =
    selectedScope === 'unattempted'
      ? '开始练未做题'
      : selectedScope === 'attempted'
        ? '开始复习已做题'
        : '开始随机练习'

  const formatLanguageLabel = (value: string) => {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'ja' || normalized.startsWith('ja-')) return '日语'
    if (normalized === 'en' || normalized.startsWith('en-')) return '英语'
    if (normalized === 'zh' || normalized.startsWith('zh-')) return '中文'
    return value
  }

  return (
    <div className='min-h-screen bg-slate-50 px-4 pb-24 pt-0 font-sans sm:pb-6 md:px-6 md:pb-8 md:pt-0'>
      <div className='mx-auto max-w-5xl'>
        <header className='mb-4 flex justify-end'>
          <Link href='/practice' className='ui-btn ui-btn-sm shrink-0'>
            返回练习
          </Link>
        </header>

        <div className='overflow-hidden rounded-[20px] bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
          <section className='border-b border-slate-100 p-5 md:p-6'>
            <h2 className='text-sm font-bold text-slate-900'>练习范围</h2>
            <div
              className='mt-3 grid grid-cols-3 gap-2'
              role='group'
              aria-label='练习范围'>
              {scopeOptions.map(option => {
                const isActive = selectedScope === option.value
                return (
                  <button
                    key={option.value}
                    type='button'
                    aria-pressed={isActive}
                    onClick={() => {
                      setSelectedScope(option.value)
                      setErrorText('')
                    }}
                    className={`rounded-xl border px-2 py-3 text-left transition-colors md:px-4 ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <span className='block text-sm font-semibold'>
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 hidden text-xs sm:block ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}>
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className='border-b border-slate-100 p-5 md:p-6'>
            <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-end'>
              <div>
                <h2 className='text-sm font-bold text-slate-900'>筛选条件</h2>
                <div className='mt-3 grid grid-cols-2 gap-2'>
                  <label className='text-xs font-medium text-slate-500'>
                    语言
                    <CustomSelect
                      aria-label='语言'
                      value={selectedLanguage}
                      onChange={event => setSelectedLanguage(event.target.value)}
                      className='mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                      <option value=''>全部</option>
                      {languageOptions.map(item => (
                        <option key={`lang-${item}`} value={item}>
                          {formatLanguageLabel(item)}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  <label className='text-xs font-medium text-slate-500'>
                    等级
                    <CustomSelect
                      aria-label='等级'
                      value={selectedLevel}
                      onChange={event => setSelectedLevel(event.target.value)}
                      className='mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                      <option value=''>全部</option>
                      {levelOptions.map(item => (
                        <option key={`level-${item}`} value={item}>
                          {item}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                </div>
              </div>

              <div>
                <h2 className='text-sm font-bold text-slate-900'>快速设置</h2>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {defaultQuickPresets.map(preset => (
                    <button
                      key={preset.title}
                      type='button'
                      onClick={() => applyCounts(preset.counts)}
                      className='ui-btn ui-btn-sm'>
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className='p-5 md:p-6'>
            <h2 className='text-sm font-bold text-slate-900'>题目数量</h2>
            <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3'>
              {options.map(option => (
                <div
                  key={option.key}
                  className='flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
                  <span className='text-sm font-semibold text-slate-700'>
                    {option.label}
                  </span>
                  <NumberStepper
                    ariaLabel={`${option.label}题数`}
                    min={0}
                    max={50}
                    value={counts[option.key] || 0}
                    onChange={value => updateCount(option.key, value)}
                  />
                </div>
              ))}
            </div>
            {errorText ? (
              <p className='mt-3 text-sm font-medium text-rose-600' role='alert'>
                {errorText}
              </p>
            ) : null}
          </section>

          <details className='border-t border-slate-100 px-5 py-4 md:px-6'>
            <summary className='cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900'>
              保存与使用预设{presets.length > 0 ? `（${presets.length}）` : ''}
            </summary>
            <div className='mt-4 border-t border-slate-100 pt-4'>
              <div className='flex flex-col gap-2 sm:flex-row'>
                <input
                  value={presetName}
                  onChange={event => setPresetName(event.target.value)}
                  placeholder='预设名称'
                  className='h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                />
                <button
                  type='button'
                  onClick={handleSavePreset}
                  className='ui-btn h-10 px-4'>
                  保存当前配置
                </button>
              </div>
              {presets.length > 0 && (
                <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                  {presets.map(preset => (
                    <div
                      key={preset.id}
                      className='flex items-center rounded-xl bg-slate-50 px-3 py-2'>
                      <button
                        type='button'
                        onClick={() => applyCounts(preset.counts, preset.scope)}
                        className='min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-700 hover:text-slate-900'>
                        {preset.name}
                      </button>
                      <button
                        type='button'
                        onClick={() => handleDeletePreset(preset.id)}
                        className='ml-3 text-xs font-semibold text-slate-400 hover:text-rose-500'>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <div className='fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur sm:static sm:bg-slate-50 sm:px-5 sm:py-4 sm:shadow-none md:px-6'>
            <p className='text-sm text-slate-500'>
              已选择 <strong className='text-slate-900'>{totalRequested}</strong>{' '}
              题
            </p>
            <button
              type='button'
              onClick={handleStart}
              disabled={totalRequested <= 0}
              className='ui-btn ui-btn-primary h-11 px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:px-8'>
              {startLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
