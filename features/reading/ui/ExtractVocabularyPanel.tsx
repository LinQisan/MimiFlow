'use client'

import { useState, useTransition } from 'react'
import type { VocabularyCandidate } from '@/modules/language/domain/sudachi'
import { saveExtractedArticleVocabulary } from '@/features/reading/vocabulary-actions'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

export default function ExtractVocabularyPanel({
  articleId,
  initialCandidates,
  onSaved,
}: {
  articleId: string
  initialCandidates: VocabularyCandidate[]
  onSaved: (items: Array<{ word: string; meta: VocabularyMeta }>) => void
}) {
  const [candidates, setCandidates] = useState(initialCandidates)
  const [selected, setSelected] = useState(
    () => new Set(initialCandidates.map(item => item.word)),
  )
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const toggle = (word: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  const saveSelected = () => {
    if (selected.size === 0 || isPending) return
    startTransition(async () => {
      setMessage('正在保存…')
      const result = await saveExtractedArticleVocabulary(
        articleId,
        [...selected],
      )
      setMessage(result.message)
      if (result.saved.length === 0) return
      const savedWords = new Set(result.saved.map(item => item.word))
      setCandidates(current =>
        current.filter(item => !savedWords.has(item.word)),
      )
      setSelected(current => {
        const next = new Set(current)
        savedWords.forEach(word => next.delete(word))
        return next
      })
      onSaved(result.saved)
    })
  }

  return (
    <section className='mx-auto mb-8 max-w-[44rem] rounded-xl border border-slate-200 bg-white p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-sm font-semibold text-slate-900'>提取生词</h2>
          <p className='mt-1 text-xs text-slate-500'>按原形列出正文实词，取消不需要的词。</p>
        </div>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => setSelected(new Set(candidates.map(item => item.word)))}
            className='text-xs font-medium text-slate-500 hover:text-slate-900'>
            全选
          </button>
          <button
            type='button'
            onClick={() => setSelected(new Set())}
            className='text-xs font-medium text-slate-500 hover:text-slate-900'>
            清空
          </button>
          <button
            type='button'
            disabled={selected.size === 0 || isPending}
            onClick={saveSelected}
            className='ui-btn ui-btn-primary ui-btn-sm disabled:opacity-40'>
            加入 {selected.size > 0 ? selected.size : ''}
          </button>
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className='mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2'>
          {candidates.map(item => (
            <label
              key={item.word}
              className='flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50'>
              <input
                type='checkbox'
                checked={selected.has(item.word)}
                onChange={() => toggle(item.word)}
                className='h-4 w-4 accent-slate-900'
              />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm font-semibold text-slate-900'>{item.word}</span>
                <span className='block truncate text-[11px] text-slate-500'>
                  {[item.reading, item.partOfSpeech, `${item.count} 次`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className='mt-4 text-sm text-slate-500'>没有新的候选词。</p>
      )}
      <p className='mt-3 min-h-4 text-xs font-medium text-slate-600' aria-live='polite'>
        {message}
      </p>
    </section>
  )
}
