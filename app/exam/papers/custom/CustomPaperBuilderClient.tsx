'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type RandomTypeOption = {
  key: string
  label: string
}

type SavedPreset = {
  id: string
  name: string
  counts: Record<string, number>
  updatedAt: number
}

type Props = {
  options: ReadonlyArray<RandomTypeOption>
}

const STORAGE_COUNTS_KEY = 'custom_practice_counts_v1'
const STORAGE_PRESETS_KEY = 'custom_practice_presets_v1'

const defaultQuickPresets: Array<{
  title: string
  counts: Record<string, number>
}> = [
  {
    title: '10 道听力',
    counts: { LISTENING: 10 },
  },
  {
    title: '1 听力 + 10 语法',
    counts: { LISTENING: 1, VOCAB_GRAMMAR: 10 },
  },
]

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

function toQueryFromCounts(counts: Record<string, number>) {
  const params = new URLSearchParams()
  Object.entries(counts).forEach(([key, value]) => {
    const next = Math.max(0, Math.floor(value || 0))
    if (next > 0) params.set(`count_${key}`, String(next))
  })
  return params.toString()
}

export default function CustomPaperBuilderClient({ options }: Props) {
  const router = useRouter()
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    createEmptyCounts(options),
  )
  const [presets, setPresets] = useState<SavedPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [errorText, setErrorText] = useState('')

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
      if (!storedPresets) return
      const parsed = JSON.parse(storedPresets) as SavedPreset[]
      if (!Array.isArray(parsed)) return
      setPresets(
        parsed
          .filter(item => item && typeof item.name === 'string')
          .map(item => ({
            ...item,
            counts: normalizeCounts(options, item.counts || {}),
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      )
    } catch {
      // ignore invalid local data
    }
  }, [options])

  useEffect(() => {
    localStorage.setItem(STORAGE_COUNTS_KEY, JSON.stringify(counts))
  }, [counts])

  useEffect(() => {
    localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(presets))
  }, [presets])

  const totalRequested = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + (value || 0), 0),
    [counts],
  )

  const updateCount = (key: string, value: string) => {
    const next = Math.max(0, Math.min(50, Math.floor(Number(value || 0))))
    setCounts(prev => ({ ...prev, [key]: Number.isFinite(next) ? next : 0 }))
    setErrorText('')
  }

  const applyCounts = (nextCounts: Record<string, number>) => {
    setCounts(normalizeCounts(options, nextCounts))
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
          { ...existing, counts: { ...counts }, updatedAt: now },
          ...prev.filter(item => item.id !== existing.id),
        ]
      }
      return [
        {
          id: `preset-${now}`,
          name: trimmedName,
          counts: { ...counts },
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
    const query = toQueryFromCounts(counts)
    if (!query) {
      setErrorText('请至少选择 1 题。')
      return
    }
    router.push(`/exam/papers/custom/do?${query}`)
  }

  return (
    <div className='min-h-screen bg-[#f7f8fc] p-6'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-5 flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-gray-900'>自定义随机练习</h1>
          <Link href='/exam/papers' className='text-sm text-blue-600 hover:underline'>
            返回试卷列表
          </Link>
        </div>

        <p className='mb-4 text-sm text-gray-500'>
          会自动记住你上次的题型数量；你也可以把常用组合保存为命名预设。
        </p>

        <div className='mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm'>
          <p className='mb-3 text-xs font-bold tracking-wide text-gray-500'>快速预设</p>
          <div className='flex flex-wrap gap-2'>
            {defaultQuickPresets.map(preset => (
              <button
                key={preset.title}
                type='button'
                onClick={() => applyCounts(preset.counts)}
                className='rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100'>
                {preset.title}
              </button>
            ))}
          </div>
        </div>

        <div className='mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm'>
          <p className='mb-3 text-xs font-bold tracking-wide text-gray-500'>我的预设</p>
          <div className='mb-3 flex gap-2'>
            <input
              value={presetName}
              onChange={event => setPresetName(event.target.value)}
              placeholder='预设名称（例如：晚间 15 题）'
              className='h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 outline-none focus:border-blue-400'
            />
            <button
              type='button'
              onClick={handleSavePreset}
              className='h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700'>
              保存预设
            </button>
          </div>

          {presets.length === 0 ? (
            <p className='text-sm text-gray-400'>还没有保存的预设。</p>
          ) : (
            <div className='space-y-2'>
              {presets.map(preset => (
                <div
                  key={preset.id}
                  className='flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2'>
                  <button
                    type='button'
                    onClick={() => applyCounts(preset.counts)}
                    className='min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-700 hover:text-blue-700'>
                    {preset.name}
                  </button>
                  <button
                    type='button'
                    onClick={() => handleDeletePreset(preset.id)}
                    className='ml-3 text-xs font-semibold text-gray-400 hover:text-red-500'>
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className='rounded-2xl border border-gray-100 bg-white p-5 shadow-sm'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {options.map(option => (
              <label key={option.key} className='flex items-center justify-between gap-4'>
                <span className='font-medium text-gray-700'>{option.label}</span>
                <input
                  type='number'
                  min={0}
                  max={50}
                  value={counts[option.key] || 0}
                  onChange={event => updateCount(option.key, event.target.value)}
                  className='w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-right text-gray-700 outline-none transition-colors focus:border-blue-400'
                />
              </label>
            ))}
          </div>

          <div className='mt-4 flex items-center justify-between text-sm'>
            <span className='text-gray-500'>
              总计 <strong className='text-gray-800'>{totalRequested}</strong> 题
            </span>
            {errorText ? <span className='text-red-500'>{errorText}</span> : null}
          </div>

          <button
            type='button'
            onClick={handleStart}
            className='mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700'>
            开始随机答题
          </button>
        </div>
      </div>
    </div>
  )
}
