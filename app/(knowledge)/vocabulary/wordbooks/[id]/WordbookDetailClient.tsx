'use client'

// Vocabulary wordbook detail client.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import WordPronunciation from '@/components/vocabulary/WordPronunciation'
import {
  createWordbook,
  moveWordbook,
  removeVocabularyFromWordbook,
  renameWordbook,
  deleteWordbook,
} from '@/modules/knowledge/wordbooks/actions'
import { useDialog } from '@/context/DialogContext'

type WordbookMeta = {
  id: string
  title: string
  parentId: string | null
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
  parentWordbook: { id: string; title: string } | null
  chapterItems: Array<{ id: string; title: string; count: number }>
  wordbooks: WordbookMeta[]
  items: WordbookVocabularyItem[]
  currentPage: number
  totalPages: number
  totalCount: number
}

export default function WordbookDetailClient({
  wordbookId,
  wordbookTitle,
  parentWordbook,
  chapterItems,
  wordbooks,
  items,
  currentPage,
  totalPages,
  totalCount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const dialog = useDialog()
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'flashcard'>('list')
  const [flashIndex, setFlashIndex] = useState(0)

  const parentOptions = useMemo(
    () =>
      wordbooks
        .filter(item => item.id !== wordbookId)
        .map(item => ({ id: item.id, label: item.title })),
    [wordbookId, wordbooks],
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
    ? currentFlash.sentences.slice(0, 3)
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
    const optionText = ['0. 根目录', ...parentOptions.map((item, idx) => `${idx + 1}. ${item.label}`)].join('\n')
    const selected = await dialog.prompt(`输入序号选择目标：\n${optionText}`, {
      title: '移动单词书',
      defaultValue: '0',
      confirmText: '移动',
    })
    if (selected == null) return
    const index = Number(selected.trim())
    if (!Number.isFinite(index) || index < 0 || index > parentOptions.length) {
      dialog.toast('请输入有效序号', { tone: 'error' })
      return
    }
    const targetParentId = index === 0 ? null : parentOptions[index - 1].id
    const res = await moveWordbook(wordbookId, targetParentId)
    if (!res.success) {
      dialog.toast(res.message || '移动失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已移动', { tone: 'success' })
  }

  const handleCreateChild = async () => {
    const name = await dialog.prompt('输入子单词书名称', {
      title: '新建子单词书',
      confirmText: '创建',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await createWordbook(trimmed, wordbookId)
    if (!res.success) {
      dialog.toast(res.message || '创建失败', { tone: 'error' })
      return
    }
    dialog.toast('子单词书已创建', { tone: 'success' })
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
    <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-5'>
      <div className='mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4'>
        <button type='button' onClick={() => void handleRename()} className='ui-btn'>
          重命名
        </button>
        <button type='button' onClick={() => void handleMove()} className='ui-btn'>
          移动
        </button>
        <button type='button' onClick={() => void handleCreateChild()} className='ui-btn'>
          新建子单词书
        </button>
        <button type='button' onClick={() => void handleDeleteWordbook()} className='ui-btn ui-btn-danger'>
          删除单词书
        </button>
        <span className='ml-auto text-sm font-semibold text-slate-500'>
          本书 {totalCount} 条 · 第 {currentPage}/{totalPages} 页
        </span>
      </div>

      <div className='mb-4 flex items-center justify-end'>
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
      </div>

      {parentWordbook ? (
        <div className='mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2'>
          <p className='text-xs font-semibold text-slate-500'>所属书籍</p>
          <Link
            href={`/vocabulary/wordbooks/${parentWordbook.id}`}
            className='mt-1 inline-flex text-sm font-bold text-slate-900 hover:text-slate-600'>
            {parentWordbook.title}
          </Link>
        </div>
      ) : null}

      {chapterItems.length > 0 ? (
        <div className='mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
          <p className='text-sm font-black text-slate-900'>目录</p>
          <div className='mt-2 divide-y divide-slate-100 border-y border-slate-100'>
            {chapterItems.map(item => (
              <Link
                key={`chapter-${item.id}`}
                href={`/vocabulary/wordbooks/${item.id}`}
                className='flex items-center justify-between px-1 py-2 text-sm transition hover:text-slate-600'>
                <span className='font-bold text-slate-900'>{item.title}</span>
                <span className='text-xs font-semibold text-slate-500'>{item.count} 条</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className='mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3'>
        <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
          <input
            value={keyword}
            onChange={event => setKeyword(event.currentTarget.value)}
            placeholder='仅搜索当前单词书词条'
            className='h-10 min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
          />
          <span className='text-xs font-semibold text-slate-500'>
            搜索结果：{filteredItems.length} 条
          </span>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          {filteredItems.map(item => (
            <div key={item.id} className='flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 md:px-4'>
              <div className='flex-1 min-w-0'>
                <p className='truncate text-[28px] font-black tracking-tight text-slate-900 md:text-[32px]'>
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
        <div className='animate-in fade-in zoom-in-95 duration-300'>
          <div className='relative flex min-h-[calc(100vh-260px)] w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7'>
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
