'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

import styles from './CustomPaperBuilderClient.module.css'

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
      setErrorText('请至少选择一个题型。')
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

  return (
    <main className={styles.page}>
      <div className='mx-auto max-w-6xl'>
        <header className={styles.header}>
          <h1 className='text-2xl font-bold tracking-tight'>自定义练习</h1>
          <Link href='/practice' className={styles.back}>
            返回试卷 <ChevronRight className='h-3.5 w-3.5' aria-hidden='true' />
          </Link>
        </header>

        {activeSession && (
          <aside className={styles.resume}>
            <span className='shrink-0'>上次练习尚未结束</span>
            <span className='hidden truncate sm:block'>{activeSession.title}</span>
            <Link href={`/practice/custom/do?session=${encodeURIComponent(activeSession.id)}`} className={styles.textAction}>
              继续练习 <span aria-hidden='true'>→</span>
            </Link>
          </aside>
        )}

        <section aria-labelledby='practice-filters' className={styles.filters}>
          <h2 id='practice-filters' className={styles.stepTitle}><span>1</span>筛选范围</h2>
          <div className={styles.filterControls}>
            <label className={styles.filterLabel}>
              语言
              <CustomSelect aria-label='语言' value={selectedLanguage}
                onChange={event => handleLanguageChange(event.target.value)} className={styles.select}>
                <option value=''>全部语言</option>
                {languageOptions.map(item => <option key={item} value={item}>{formatLanguageLabel(item)}</option>)}
              </CustomSelect>
            </label>
            <label className={styles.filterLabel}>
              等级
              <CustomSelect aria-label='等级' value={selectedLevel}
                onChange={event => { setSelectedLevel(event.target.value); setErrorText('') }} className={styles.select}>
                <option value=''>全部等级</option>
                {visibleLevelOptions.map(item => <option key={item} value={item}>{item}</option>)}
              </CustomSelect>
            </label>
            <div className={styles.scope}>
              <span>范围</span>
              <div className={styles.segments} role='group' aria-label='练习范围'>
                {scopeOptions.map(option => (
                  <button key={option.value} type='button' aria-pressed={selectedScope === option.value}
                    onClick={() => { setSelectedScope(option.value); setErrorText('') }}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby='practice-content' className={styles.content}>
          <div className={styles.contentHeader}>
            <h2 id='practice-content' className={styles.stepTitle}><span>2</span>选择题型</h2>
            <div className={styles.selectionActions}>
              <span className='tabular-nums'>已选 {selectedKeys.length}/{allVisibleKeys.length}</span>
              <button type='button' disabled={allVisibleSelected || !allVisibleKeys.length} className={styles.textAction}
                onClick={() => { setSelectedKeys(allVisibleKeys); setErrorText('') }}>全选</button>
              <button type='button' disabled={!selectedKeys.length} className={styles.textAction}
                onClick={() => { setSelectedKeys([]); setErrorText('') }}>清除</button>
            </div>
          </div>
          <p className={styles.hint}>点击分类名称可整组选取，也可逐项组合。</p>
          <div>
            {groups.map(group => {
              const selectedCount = group.options.filter(option => selectedKeySet.has(option.key)).length
              const allSelected = group.options.length > 0 && selectedCount === group.options.length
              return (
                <div key={group.key} role='group' aria-labelledby={`practice-group-${group.key}`} className={styles.category}>
                  <button type='button' onClick={() => toggleGroup(group)}
                    aria-label={`${allSelected ? '取消选择' : '选择'}整个分类：${group.label}`}
                    aria-pressed={allSelected} disabled={!group.options.length} className={styles.categoryTitle}>
                    <span id={`practice-group-${group.key}`}>{group.label}</span>
                    <span className={styles.categoryCount}>{selectedCount}/{group.options.length}</span>
                  </button>
                  <div className={styles.options}>
                    {group.options.map(option => (
                      <label key={option.key} className={styles.option}>
                        <input type='checkbox' checked={selectedKeySet.has(option.key)} onChange={() => toggleOption(option.key)} />
                        <span className='min-w-0'>{option.label.replace(/^問題\d+｜/, '')}</span>
                        {option.sectionNumber !== null && <span className={styles.number}>問題{option.sectionNumber}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {!allVisibleKeys.length && <p className='ui-empty'>当前语言暂无可选题型，请调整筛选范围。</p>}
        </section>

        <footer className={styles.footer} aria-label='设置题数并开始练习'>
          {errorText && <p className='mb-2 text-sm text-rose-600' role='alert'>{errorText}</p>}
          <div className={styles.footerContent}>
            <p className={styles.summary} aria-live='polite'>
              已选 <strong>{selectedKeys.length}</strong> 个题型
              <span aria-hidden='true'> · </span>计划抽取 <strong>{questionCount}</strong> 题
            </p>
            <div className={styles.startControls}>
              <div className={styles.countControl}>
                <span className={styles.stepTitle}><span>3</span>题数</span>
                <NumberStepper ariaLabel='随机抽取题数' min={1} max={100} value={questionCount}
                  onChange={value => { setQuestionCount(value); setErrorText('') }} className='w-32' />
              </div>
              <button type='button' onClick={handleStart}
                disabled={selectedKeys.length === 0 || questionCount <= 0 || isStarting}
                className='ui-btn ui-btn-primary min-h-11 shrink-0 px-6 disabled:cursor-not-allowed disabled:opacity-40'>
                {isStarting ? '正在准备…' : '开始练习'}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
