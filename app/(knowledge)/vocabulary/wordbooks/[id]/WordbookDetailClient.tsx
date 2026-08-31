'use client'

// Vocabulary wordbook detail client.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import WordPronunciation from '@/components/vocabulary/WordPronunciation'
import {
  createWordbook,
  createWordbookSeries,
  moveWordbook,
  removeVocabularyFromWordbook,
  renameWordbook,
  renameWordbookSeries,
  deleteWordbook,
} from '@/modules/knowledge/wordbooks/actions'
import { useDialog } from '@/context/DialogContext'

type WordbookSeriesMeta = {
  id: string
  title: string
}

type WordbookVocabularyItem = {
  id: string
  word: string
  wordAudio?: string | null
  pronunciations: string[]
  partsOfSpeech: string[]
  sentences?: Array<{
    text: string
    translation?: string | null
    audioFile?: string | null
    source?: string
    sourceUrl?: string
  }>
}

type Props = {
  wordbookId: string
  wordbookTitle: string
  series: WordbookSeriesMeta
  seriesOptions: WordbookSeriesMeta[]
  items: WordbookVocabularyItem[]
  currentPage: number
  totalPages: number
  totalCount: number
}

export default function WordbookDetailClient({
  wordbookId,
  wordbookTitle,
  series,
  seriesOptions,
  items,
  currentPage,
  totalPages,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const dialog = useDialog()
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'flashcard'>('list')
  const [flashIndex, setFlashIndex] = useState(0)
  const [showManagement, setShowManagement] = useState(false)

  const moveOptions = useMemo(
    () => seriesOptions.filter(item => item.id !== series.id),
    [series.id, seriesOptions],
  )

  const toPage = (page: number) => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    router.push(`${pathname}?${params.toString()}`)
  }

  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    if (!normalizedKeyword) return items
    return items.filter(item => {
      const word = item.word.toLowerCase()
      const pron = item.pronunciations.join(' ').toLowerCase()
      const pos = item.partsOfSpeech.join(' ').toLowerCase()
      return (
        word.includes(normalizedKeyword) ||
        pron.includes(normalizedKeyword) ||
        pos.includes(normalizedKeyword)
      )
    })
  }, [items, normalizedKeyword])

  const currentFlash = filteredItems[flashIndex] || null
  const flashSentences = Array.isArray(currentFlash?.sentences)
    ? currentFlash.sentences.slice(0, 2)
    : []

  const playAudioFile = (audioFile?: string | null) => {
    if (!audioFile) return
    const audio = new Audio(audioFile)
    void audio.play().catch(() => {})
  }

  useEffect(() => {
    if (viewMode !== 'flashcard') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }

      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        setFlashIndex(prev => Math.max(0, prev - 1))
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        setFlashIndex(prev => Math.min(filteredItems.length - 1, prev + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewMode, filteredItems.length])

  useEffect(() => {
    setFlashIndex(0)
  }, [keyword, viewMode, currentPage])

  const handleRename = async () => {
    const name = await dialog.prompt('输入新名称', {
      title: '重命名单词书',
      defaultValue: wordbookTitle,
      confirmText: '保存',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await renameWordbook(wordbookId, trimmed)
    if (!res.success) {
      dialog.toast(res.message || '保存失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已更新', { tone: 'success' })
  }

  const handleMove = async () => {
    if (moveOptions.length === 0) {
      dialog.toast('没有其他可用的词书系列', { tone: 'info' })
      return
    }
    const optionText = moveOptions
      .map((item, index) => `${index + 1}. ${item.title}`)
      .join('\n')
    const selected = await dialog.prompt(`输入序号选择目标：\n${optionText}`, {
      title: '移动到其他系列',
      defaultValue: '1',
      confirmText: '移动',
    })
    if (selected == null) return
    const index = Number(selected.trim())
    if (!Number.isFinite(index) || index < 1 || index > moveOptions.length) {
      dialog.toast('请输入有效序号', { tone: 'error' })
      return
    }
    const res = await moveWordbook(wordbookId, moveOptions[index - 1].id)
    if (!res.success) {
      dialog.toast(res.message || '移动失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已移动', { tone: 'success' })
  }

  const handleCreateSibling = async () => {
    const name = await dialog.prompt(`在「${series.title}」中新建词书`, {
      title: '新建同系列词书',
      confirmText: '创建',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await createWordbook(trimmed, series.id)
    if (!res.success) {
      dialog.toast(res.message || '创建失败', { tone: 'error' })
      return
    }
    dialog.toast('词书已创建', { tone: 'success' })
    router.refresh()
  }

  const handleRenameSeries = async () => {
    const name = await dialog.prompt('输入新的词书系列名称', {
      title: '重命名词书系列',
      defaultValue: series.title,
      confirmText: '保存',
    })
    if (name == null) return
    const res = await renameWordbookSeries(series.id, name)
    if (!res.success) {
      dialog.toast(res.message || '保存失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('词书系列已更新', { tone: 'success' })
  }

  const handleCreateSeriesAndMove = async () => {
    const name = await dialog.prompt('输入新词书系列名称', {
      title: '新建系列并移动当前词书',
      confirmText: '创建并移动',
    })
    if (name == null) return
    const created = await createWordbookSeries(name)
    if (!created.success || !created.series) {
      dialog.toast(created.message || '创建失败', { tone: 'error' })
      return
    }
    const moved = await moveWordbook(wordbookId, created.series.id)
    if (!moved.success) {
      dialog.toast(moved.message || '移动失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已创建系列并移动当前词书', { tone: 'success' })
  }

  const handleDeleteWordbook = async () => {
    const confirmed = await dialog.confirm(
      `确认删除「${wordbookTitle}」吗？该单词书中的关联会被移除。`,
      {
        title: '删除单词书',
        confirmText: '删除',
        danger: true,
      },
    )
    if (!confirmed) return
    const res = await deleteWordbook(wordbookId)
    if (!res.success) {
      dialog.toast(res.message || '删除失败', { tone: 'error' })
      return
    }
    dialog.toast('单词书已删除', { tone: 'success' })
    router.push('/vocabulary?view=wordbooks')
    router.refresh()
  }

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-4 md:p-5'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4'>
        <span className='text-sm text-slate-500'>
          第 {currentPage}/{totalPages} 页
        </span>
        <div className='flex items-center gap-1 rounded-xl bg-slate-100 p-1'>
          <button
            type='button'
            onClick={() => setViewMode('list')}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${
              viewMode === 'list'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            列表
          </button>
          <button
            type='button'
            onClick={() => {
              setViewMode('flashcard')
              setFlashIndex(0)
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${
              viewMode === 'flashcard'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            闪卡
          </button>
        </div>
        <button
          type='button'
          aria-expanded={showManagement}
          onClick={() => setShowManagement(value => !value)}
          className='ui-btn ui-btn-sm'>
          管理
        </button>
      </div>

      {showManagement ? (
        <div className='mb-4 flex flex-wrap gap-2 rounded-xl bg-slate-50 p-3'>
          <button type='button' onClick={() => void handleRename()} className='ui-btn ui-btn-sm'>
            重命名
          </button>
          <button type='button' onClick={() => void handleMove()} className='ui-btn ui-btn-sm'>
            移动
          </button>
          <button type='button' onClick={() => void handleRenameSeries()} className='ui-btn ui-btn-sm'>
            重命名系列
          </button>
          <button type='button' onClick={() => void handleCreateSeriesAndMove()} className='ui-btn ui-btn-sm'>
            新建系列并移动
          </button>
          <button type='button' onClick={() => void handleCreateSibling()} className='ui-btn ui-btn-sm'>
            新建同系列词书
          </button>
          <button type='button' onClick={() => void handleDeleteWordbook()} className='ui-btn ui-btn-sm ui-btn-danger'>
            删除
          </button>
        </div>
      ) : null}

      <div className='mb-3 flex items-center gap-2 text-sm text-slate-500'>
        <span>词书系列</span>
        <span className='font-bold text-slate-900'>{series.title}</span>
      </div>

      <input
        type='search'
        value={keyword}
        onChange={event => setKeyword(event.currentTarget.value)}
        placeholder='搜索当前单词书'
        aria-label='搜索当前单词书'
        className='mb-4 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
      />

      {viewMode === 'list' ? (
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          {filteredItems.map(item => (
            <div key={item.id} className='flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 md:px-4'>
              <div className='flex-1 min-w-0'>
                <p className='truncate text-xl font-black tracking-tight text-slate-900 md:text-2xl'>
                  {item.word}
                </p>
                <p className='mt-1 truncate text-xs font-semibold text-slate-500'>
                  {(item.pronunciations[0] || '').trim()}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <span className='text-xs text-slate-500'>
                  {(item.partsOfSpeech[0] || '').trim()}
                </span>
                <Link
                  href={`/vocabulary?focus=${item.id}`}
                  className='inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'>
                  编辑
                </Link>
                <button
                  type='button'
                  onClick={async () => {
                    const res = await removeVocabularyFromWordbook(item.id, wordbookId)
                    if (!res.success) {
                      dialog.toast(res.message || '移出失败', { tone: 'error' })
                      return
                    }
                    dialog.toast('已移出', { tone: 'success' })
                    router.refresh()
                  }}
                  className='inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'>
                  移出
                </button>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 ? (
            <p className='px-3 py-8 text-sm text-slate-500'>当前单词书暂无词条</p>
          ) : null}
        </div>
      ) : (
        <div className='mx-auto max-w-3xl'>
          <div className='relative flex min-h-[520px] w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 md:p-7'>
          {currentFlash ? (
            <>
              <div className='mb-3 border-b border-slate-100 pb-4 text-center'>
                <WordPronunciation
                  word={currentFlash.word}
                  pronunciation={currentFlash.pronunciations[0] || ''}
                  pronunciations={currentFlash.pronunciations}
                  showPronunciation
                  wordClassName='text-4xl font-black tracking-tight text-slate-900 md:text-5xl'
                  hintClassName='text-xs font-semibold text-slate-500 md:text-sm'
                />
                {(currentFlash.partsOfSpeech[0] || '').trim() ? (
                  <div className='mt-3'>
                    <span className='ui-tag ui-tag-muted h-6 px-2.5 text-[11px]'>
                      {(currentFlash.partsOfSpeech[0] || '').trim()}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className='mb-5 flex items-center justify-center gap-2'>
                {currentFlash.wordAudio ? (
                  <button
                    type='button'
                    onClick={() => playAudioFile(currentFlash.wordAudio)}
                    className='ui-btn ui-btn-sm h-8 px-3 text-xs font-semibold text-slate-600'>
                    发音
                  </button>
                ) : null}
                <Link href={`/vocabulary?focus=${currentFlash.id}`} className='ui-btn ui-btn-sm'>
                  编辑
                </Link>
              </div>

              {flashSentences.length > 0 ? (
                <div className='space-y-2'>
                  {flashSentences.map((sentence, idx) => (
                    <div
                      key={`${currentFlash.id}-sent-${idx}`}
                      className='rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3'>
                      <p className='text-[15px] leading-relaxed text-slate-800'>
                        {sentence.text}
                      </p>
                      <div className='mt-2 flex items-center gap-2 text-[12px] text-slate-400'>
                        {sentence.sourceUrl ? (
                          <Link
                            href={sentence.sourceUrl}
                            className='underline-offset-2 hover:text-slate-600 hover:underline'>
                            {sentence.source || '来源'}
                          </Link>
                        ) : sentence.source ? (
                          <span>{sentence.source}</span>
                        ) : null}
                        {sentence.audioFile ? (
                          <>
                            <span>｜</span>
                            <button
                              type='button'
                              onClick={() => playAudioFile(sentence.audioFile)}
                              className='font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline'>
                              播放
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className='mt-auto pt-5'>
                <div className='flex items-center justify-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setFlashIndex(prev => Math.max(0, prev - 1))}
                    disabled={flashIndex <= 0}
                    className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                    上一张
                  </button>
                  <span className='ui-tag ui-tag-muted h-6 px-2 text-[11px] font-semibold'>
                    {flashIndex + 1}/{filteredItems.length}
                  </span>
                  <button
                    type='button'
                    onClick={() =>
                      setFlashIndex(prev => Math.min(filteredItems.length - 1, prev + 1))
                    }
                    disabled={flashIndex >= filteredItems.length - 1}
                    className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                    下一张
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className='py-8 text-center text-sm text-slate-500'>当前单词书暂无词条</p>
          )}
          </div>
        </div>
      )}

      <div className='mt-3 flex items-center justify-end gap-2'>
        <button
          type='button'
          onClick={() => toPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
          上一页
        </button>
        <button
          type='button'
          onClick={() => toPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
          下一页
        </button>
      </div>
    </section>
  )
}
