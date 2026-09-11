'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, RotateCcw } from 'lucide-react'

import CustomSelect from '@/components/ui/CustomSelect'
import NumberStepper from '@/components/ui/NumberStepper'
import type { RandomPracticeSelectionGroup } from '@/lib/repositories/exam'

type PracticeScope = 'unattempted' | 'attempted' | 'all'

type Props = {
  japaneseGroups: ReadonlyArray<RandomPracticeSelectionGroup>
  genericGroups: ReadonlyArray<RandomPracticeSelectionGroup>
  languageOptions: string[]
  levelOptions: string[]
  levelOptionsByLanguage: Record<string, string[]>
  activeSession?: { id: string; title: string } | null
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
  levelOptionsByLanguage,
  activeSession,
}: Props) {
  const router = useRouter()
  const [isStarting, startTransition] = useTransition()
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
  const visibleLevelOptions = selectedLanguage
    ? levelOptionsByLanguage[selectedLanguage] || []
    : levelOptions
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const allVisibleKeys = useMemo(
    () => groups.flatMap(group => group.options.map(option => option.key)),
    [groups],
  )
  const allVisibleSelected =
    allVisibleKeys.length > 0 &&
    allVisibleKeys.every(key => selectedKeySet.has(key))

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
    setSelectedLevel(current =>
      current && !(levelOptionsByLanguage[value] || []).includes(current)
        ? ''
        : current,
    )
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
    startTransition(() => {
      router.push(`/practice/custom/do?${params.toString()}`)
    })
  }

  const startLabel =
    selectedScope === 'unattempted'
      ? '开始练未做题'
      : selectedScope === 'attempted'
        ? '开始复习已做题'
        : '开始随机练习'

  return (
    <main className='min-h-screen bg-stone-50 px-4 pb-28 text-slate-900 md:px-6 md:pb-10'>
      <div className='mx-auto max-w-6xl'>
        <header className='flex items-center justify-between border-b border-slate-200 py-6'>
          <h1 className='text-2xl font-bold tracking-tight'>自定义练习</h1>
          <Link
            href='/practice'
            className='inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
            返回试卷
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Link>
        </header>

        {activeSession && (
          <aside className='mt-5 flex flex-col gap-3 border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <p className='text-xs font-semibold text-slate-500'>上次练习尚未结束</p>
              <p className='mt-0.5 truncate text-sm font-semibold text-slate-900'>
                {activeSession.title}
              </p>
            </div>
            <Link
              href={`/practice/custom/do?session=${encodeURIComponent(activeSession.id)}`}
              className='ui-btn ui-btn-sm shrink-0'>
              继续练习
            </Link>
          </aside>
        )}

        <section className='grid gap-5 border-b border-slate-200 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end'>
          <label className='text-sm font-semibold text-slate-600'>
            语言
            <CustomSelect
              aria-label='语言'
              value={selectedLanguage}
              onChange={event => handleLanguageChange(event.target.value)}
              className='mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none'>
              <option value=''>全部语言</option>
              {languageOptions.map(item => (
                <option key={item} value={item}>
                  {formatLanguageLabel(item)}
                </option>
              ))}
            </CustomSelect>
          </label>

          <label className='text-sm font-semibold text-slate-600'>
            等级
            <CustomSelect
              aria-label='等级'
              value={selectedLevel}
              onChange={event => {
                setSelectedLevel(event.target.value)
                setErrorText('')
              }}
              className='mt-2 h-11 w-full border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none'>
              <option value=''>全部等级</option>
              {visibleLevelOptions.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </CustomSelect>
          </label>

          <div>
            <span className='block text-sm font-semibold text-slate-600'>范围</span>
            <div
              className='mt-2 grid h-11 grid-cols-3 gap-1 bg-slate-100 p-1'
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
                  className={`h-9 whitespace-nowrap px-3 text-sm font-semibold transition ${
                    selectedScope === option.value
                      ? 'bg-white text-slate-950 ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className='py-6'>
          <div className='mb-4 flex flex-wrap items-end justify-between gap-4'>
            <div>
              <div className='flex items-baseline gap-3'>
                <h2 className='text-xl font-bold'>练习内容</h2>
                <span className='text-sm font-semibold tabular-nums text-slate-500'>
                  已选 {selectedKeys.length}/{allVisibleKeys.length}
                </span>
              </div>
              <p className='mt-1 text-sm text-slate-500'>
                可选择整个分类，也可组合具体题型
              </p>
            </div>
            <div className='flex items-center gap-4'>
              {selectedKeys.length > 0 && !allVisibleSelected && (
                <button
                  type='button'
                  onClick={() => {
                    setSelectedKeys([])
                    setErrorText('')
                  }}
                  className='inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-950'>
                  <RotateCcw className='h-3.5 w-3.5' aria-hidden='true' />
                  清除
                </button>
              )}
              <button
                type='button'
                onClick={() => {
                  setSelectedKeys(allVisibleSelected ? [] : allVisibleKeys)
                  setErrorText('')
                }}
                className='min-h-10 text-sm font-semibold text-indigo-700 transition hover:text-indigo-900'>
                {allVisibleSelected ? '取消全选' : '选择全部'}
              </button>
            </div>
          </div>

          <div className='overflow-hidden border border-slate-200 bg-white'>
            <div className='grid md:grid-cols-2'>
              {groups.map((group, groupIndex) => {
                const selectedCount = group.options.filter(option =>
                  selectedKeySet.has(option.key),
                ).length
                const allSelected = selectedCount === group.options.length
                const partiallySelected = selectedCount > 0 && !allSelected

                return (
                  <div
                    key={group.key}
                    role='group'
                    aria-labelledby={`practice-group-${group.key}`}
                    className={`min-w-0 p-5 sm:p-6 ${
                      groupIndex > 0 ? 'border-t border-slate-200' : ''
                    } ${groupIndex % 2 === 1 ? 'md:border-l' : ''} ${
                      groupIndex === 1 ? 'md:border-t-0' : ''
                    }`}>
                    <div className='mb-4 flex items-center justify-between gap-3'>
                      <button
                        type='button'
                        role='checkbox'
                        aria-checked={partiallySelected ? 'mixed' : allSelected}
                        onClick={() => toggleGroup(group)}
                        className='group flex min-h-10 items-center gap-3 text-left'>
                        <span
                          aria-hidden='true'
                          className={`grid h-5 w-5 shrink-0 place-items-center border transition ${
                            selectedCount > 0
                              ? 'border-indigo-700 bg-indigo-700 text-white'
                              : 'border-slate-300 bg-white text-transparent group-hover:border-slate-500'
                          }`}>
                          {partiallySelected ? (
                            <span className='h-0.5 w-2.5 bg-current' />
                          ) : (
                            <Check className='h-3.5 w-3.5' strokeWidth={3} />
                          )}
                        </span>
                        <span
                          id={`practice-group-${group.key}`}
                          className='text-base font-bold text-slate-900'>
                          {group.label}
                        </span>
                      </button>
                      <span className='text-sm tabular-nums text-slate-400'>
                        {selectedCount}/{group.options.length}
                      </span>
                    </div>

                    <div className='grid gap-2 sm:grid-cols-2'>
                      {group.options.map(option => {
                        const isSelected = selectedKeySet.has(option.key)
                        return (
                          <button
                            key={option.key}
                            type='button'
                            aria-pressed={isSelected}
                            onClick={() => toggleOption(option.key)}
                            className={`flex min-h-11 items-center gap-2.5 border px-3 py-2 text-left text-sm font-medium transition ${
                              isSelected
                                ? 'border-indigo-700 bg-indigo-50 text-indigo-950'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950'
                            }`}>
                            <span
                              aria-hidden='true'
                              className={`grid h-4 w-4 shrink-0 place-items-center border ${
                                isSelected
                                  ? 'border-indigo-700 bg-indigo-700 text-white'
                                  : 'border-slate-300 text-transparent'
                              }`}>
                              <Check className='h-3 w-3' strokeWidth={3} />
                            </span>
                            <span>{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {errorText ? (
            <p className='mt-4 text-sm font-medium text-rose-600' role='alert'>
              {errorText}
            </p>
          ) : null}
        </section>

        <footer className='fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:border md:bg-white md:px-5 md:py-4 md:backdrop-blur-none'>
          <div className='mx-auto flex max-w-6xl items-center justify-between gap-4'>
            <div className='flex min-w-0 items-center gap-3 sm:gap-5'>
              <div className='flex items-center gap-2 sm:gap-3'>
                <span className='shrink-0 text-sm font-semibold text-slate-600'>题数</span>
                <NumberStepper
                  ariaLabel='随机抽取题数'
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={value => {
                    setQuestionCount(value)
                    setErrorText('')
                  }}
                  className='min-w-0 max-w-32'
                />
              </div>
              <div className='hidden items-center gap-1.5 lg:flex' aria-label='常用题数'>
                {[5, 10, 20].map(count => (
                  <button
                    key={count}
                    type='button'
                    aria-pressed={questionCount === count}
                    onClick={() => setQuestionCount(count)}
                    className={`h-8 min-w-10 border px-2 text-sm font-semibold tabular-nums transition ${
                      questionCount === count
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'
                    }`}>
                    {count}
                  </button>
                ))}
              </div>
              <p className='hidden text-sm text-slate-500 xl:block'>
                {selectedKeys.length > 0
                  ? `从 ${selectedKeys.length} 个题型中随机抽取`
                  : '请先选择练习内容'}
              </p>
            </div>
            <button
              type='button'
              onClick={handleStart}
              disabled={selectedKeys.length === 0 || questionCount <= 0 || isStarting}
              className='ui-btn ui-btn-primary h-11 shrink-0 px-5 sm:min-w-40 sm:px-6 disabled:cursor-not-allowed disabled:opacity-40'>
              {isStarting ? '正在准备…' : startLabel}
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}
