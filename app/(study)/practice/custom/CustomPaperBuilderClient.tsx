'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import CustomSelect from '@/components/ui/CustomSelect'
import NumberStepper from '@/components/ui/NumberStepper'
import type { RandomPracticeSelectionGroup } from '@/lib/repositories/exam'

type PracticeScope = 'unattempted' | 'attempted' | 'all'

type Props = {
  japaneseGroups: ReadonlyArray<RandomPracticeSelectionGroup>
  genericGroups: ReadonlyArray<RandomPracticeSelectionGroup>
  languageOptions: string[]
  levelOptions: string[]
}

const scopeOptions: Array<{ value: PracticeScope; label: string }> = [
  { value: 'unattempted', label: '未做题' },
  { value: 'attempted', label: '已做题' },
  { value: 'all', label: '全部题目' },
]

const isJapaneseLanguage = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized === 'ja' || normalized.startsWith('ja-')
}

const formatLanguageLabel = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ja' || normalized.startsWith('ja-')) return '日语'
  if (normalized === 'en' || normalized.startsWith('en-')) return '英语'
  if (normalized === 'zh' || normalized.startsWith('zh-')) return '中文'
  return value
}

export default function CustomPaperBuilderClient({
  japaneseGroups,
  genericGroups,
  languageOptions,
  levelOptions,
}: Props) {
  const router = useRouter()
  const defaultLanguage =
    languageOptions.find(isJapaneseLanguage) || languageOptions[0] || ''
  const [selectedLanguage, setSelectedLanguage] = useState(defaultLanguage)
  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedScope, setSelectedScope] =
    useState<PracticeScope>('unattempted')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState(10)
  const [errorText, setErrorText] = useState('')

  const groups = isJapaneseLanguage(selectedLanguage)
    ? japaneseGroups
    : genericGroups
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const allVisibleKeys = useMemo(
    () => groups.flatMap(group => group.options.map(option => option.key)),
    [groups],
  )

  const toggleOption = (key: string) => {
    setSelectedKeys(current =>
      current.includes(key)
        ? current.filter(item => item !== key)
        : [...current, key],
    )
    setErrorText('')
  }

  const toggleGroup = (group: RandomPracticeSelectionGroup) => {
    const groupKeys = group.options.map(option => option.key)
    const allSelected = groupKeys.every(key => selectedKeySet.has(key))
    setSelectedKeys(current => {
      const next = new Set(current)
      groupKeys.forEach(key => {
        if (allSelected) next.delete(key)
        else next.add(key)
      })
      return Array.from(next)
    })
    setErrorText('')
  }

  const handleLanguageChange = (value: string) => {
    setSelectedLanguage(value)
    setSelectedKeys([])
    setErrorText('')
  }

  const handleStart = () => {
    if (selectedKeys.length === 0) {
      setErrorText('请至少选择一个分类或問題。')
      return
    }
    if (questionCount <= 0) {
      setErrorText('题目数量至少为 1。')
      return
    }

    const params = new URLSearchParams()
    params.set('sections', selectedKeys.join(','))
    params.set('count', String(questionCount))
    if (selectedLanguage) params.set('language', selectedLanguage)
    if (selectedLevel) params.set('level', selectedLevel)
    params.set('scope', selectedScope)
    router.push(`/practice/custom/do?${params.toString()}`)
  }

  const startLabel =
    selectedScope === 'unattempted'
      ? '开始练未做题'
      : selectedScope === 'attempted'
        ? '开始复习已做题'
        : '开始随机练习'

  return (
    <main className='min-h-screen bg-stone-50 px-4 pb-24 text-slate-900 md:px-6 md:pb-10'>
      <div className='mx-auto max-w-5xl'>
        <header className='flex items-end justify-between border-b border-slate-200 py-6'>
          <div>
            <h1 className='text-2xl font-black tracking-tight'>自定义练习</h1>
            <p className='mt-1 text-sm text-slate-500'>选择范围后随机抽题</p>
          </div>
          <Link
            href='/practice'
            className='text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
            返回试卷
          </Link>
        </header>

        <section className='grid gap-5 border-b border-slate-200 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end'>
          <label className='text-xs font-semibold text-slate-500'>
            语言
            <CustomSelect
              aria-label='语言'
              value={selectedLanguage}
              onChange={event => handleLanguageChange(event.target.value)}
              className='mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
              <option value=''>全部语言</option>
              {languageOptions.map(item => (
                <option key={item} value={item}>
                  {formatLanguageLabel(item)}
                </option>
              ))}
            </CustomSelect>
          </label>

          <label className='text-xs font-semibold text-slate-500'>
            等级
            <CustomSelect
              aria-label='等级'
              value={selectedLevel}
              onChange={event => setSelectedLevel(event.target.value)}
              className='mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
              <option value=''>全部等级</option>
              {levelOptions.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </CustomSelect>
          </label>

          <div>
            <span className='block text-xs font-semibold text-slate-500'>范围</span>
            <div
              className='mt-2 flex h-11 items-center gap-1 rounded-lg bg-slate-100 p-1'
              role='group'
              aria-label='练习范围'>
              {scopeOptions.map(option => (
                <button
                  key={option.value}
                  type='button'
                  aria-pressed={selectedScope === option.value}
                  onClick={() => {
                    setSelectedScope(option.value)
                    setErrorText('')
                  }}
                  className={`h-9 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition ${
                    selectedScope === option.value
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className='py-6'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h2 className='font-bold'>练习内容</h2>
              <p className='mt-1 text-xs text-slate-500'>选择分类，或只选择具体問題</p>
            </div>
            <button
              type='button'
              onClick={() => {
                const allSelected = allVisibleKeys.every(key =>
                  selectedKeySet.has(key),
                )
                setSelectedKeys(allSelected ? [] : allVisibleKeys)
                setErrorText('')
              }}
              className='text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
              {allVisibleKeys.every(key => selectedKeySet.has(key))
                ? '清除全部'
                : '选择全部'}
            </button>
          </div>

          <div className='border-y border-slate-200'>
            {groups.map(group => {
              const selectedCount = group.options.filter(option =>
                selectedKeySet.has(option.key),
              ).length
              const allSelected = selectedCount === group.options.length
              const partiallySelected = selectedCount > 0 && !allSelected

              return (
                <div
                  key={group.key}
                  className='grid gap-3 border-b border-slate-200 py-5 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)]'>
                  <button
                    type='button'
                    aria-pressed={allSelected}
                    onClick={() => toggleGroup(group)}
                    className='flex items-center gap-3 self-start text-left'>
                    <span
                      aria-hidden='true'
                      className={`grid h-5 w-5 place-items-center rounded border text-xs font-black ${
                        selectedCount > 0
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}>
                      {partiallySelected ? '−' : '✓'}
                    </span>
                    <span>
                      <strong className='block text-sm'>{group.label}</strong>
                      <span className='mt-0.5 block text-xs text-slate-400'>
                        {selectedCount}/{group.options.length}
                      </span>
                    </span>
                  </button>

                  <div className='flex flex-wrap gap-2'>
                    {group.options.map(option => {
                      const isSelected = selectedKeySet.has(option.key)
                      return (
                        <button
                          key={option.key}
                          type='button'
                          aria-pressed={isSelected}
                          onClick={() => toggleOption(option.key)}
                          className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-transparent text-slate-600 hover:border-slate-400 hover:text-slate-950'
                          }`}>
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {errorText ? (
            <p className='mt-4 text-sm font-medium text-rose-600' role='alert'>
              {errorText}
            </p>
          ) : null}
        </section>

        <footer className='fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:bg-transparent md:px-0 md:py-5 md:backdrop-blur-none'>
          <div className='mx-auto flex max-w-5xl items-center justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <span className='text-sm font-semibold text-slate-600'>题数</span>
              <NumberStepper
                ariaLabel='随机抽取题数'
                min={1}
                max={100}
                value={questionCount}
                onChange={setQuestionCount}
              />
              <span className='hidden text-xs text-slate-400 sm:inline'>
                已选 {selectedKeys.length} 个范围
              </span>
            </div>
            <button
              type='button'
              onClick={handleStart}
              disabled={selectedKeys.length === 0 || questionCount <= 0}
              className='ui-btn ui-btn-primary h-11 px-6 disabled:cursor-not-allowed disabled:opacity-40'>
              {startLabel}
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}
