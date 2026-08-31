'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import {
  getVocabularyInspectorData,
  updateVocabularyFromInspector,
  type VocabularyDefinitionDraft,
  type VocabularyInspectorData,
} from '@/modules/knowledge/vocabulary/inspector-actions'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import WordAudioButton from '@/components/vocabulary/WordAudioButton'

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-800'
const LABEL_CLASS = 'text-xs font-bold text-slate-700 dark:text-slate-300'

const splitLines = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

export default function VocabularyWordbookInspector({
  word,
  x,
  y,
  onClose,
  onSaved,
}: {
  word: string
  x: number
  y: number
  onClose: () => void
  onSaved?: (payload: {
    word: string
    meta: VocabularyMeta
    membershipsChanged: boolean
  }) => void
}) {
  const [data, setData] = useState<VocabularyInspectorData | null>(null)
  const [loadMessage, setLoadMessage] = useState('正在加载单词信息…')
  const [isEditing, setIsEditing] = useState(false)
  const [pronunciations, setPronunciations] = useState('')
  const [partsOfSpeech, setPartsOfSpeech] = useState('')
  const [meanings, setMeanings] = useState('')
  const [wordbookIds, setWordbookIds] = useState<Set<string>>(new Set())
  const [definitions, setDefinitions] = useState<VocabularyDefinitionDraft[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLElement>(null)
  const [panelSize, setPanelSize] = useState({ width: 384, height: 420 })
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }))

  const resetDraft = (next: VocabularyInspectorData) => {
    setPronunciations(next.pronunciations.join('\n'))
    setPartsOfSpeech(next.partsOfSpeech.join('\n'))
    setMeanings(next.meanings.join('\n'))
    setWordbookIds(new Set(next.memberships.map(item => item.id)))
    setDefinitions(
      next.definitions.map(definition => ({
        language: definition.language,
        dictionaryName: definition.dictionaryName,
        definition: definition.definition,
      })),
    )
  }

  useEffect(() => {
    let active = true
    setData(null)
    setIsEditing(false)
    setLoadMessage('正在加载单词信息…')
    setStatusMessage('')
    void getVocabularyInspectorData(word)
      .then(result => {
        if (!active) return
        if (!result.success) {
          setLoadMessage(result.message)
          return
        }
        setData(result.data)
        resetDraft(result.data)
      })
      .catch(() => {
        if (active) setLoadMessage('单词信息加载失败，请关闭后重试')
      })
    return () => {
      active = false
    }
  }, [word])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isPending) return
      event.preventDefault()
      if (isEditing && data) {
        resetDraft(data)
        setStatusMessage('')
        setIsEditing(false)
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [data, isEditing, isPending, onClose])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const measure = () => {
      const rect = panel.getBoundingClientRect()
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) }
      setPanelSize(current =>
        current.width === next.width && current.height === next.height ? current : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [data, definitions.length, isEditing])

  useEffect(() => {
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isEditing &&
        !isPending &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }
    window.addEventListener('resize', handleResize)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isEditing, isPending, onClose])

  const viewportPadding = 12
  const left = Math.max(
    viewportPadding,
    Math.min(x + 12, viewport.width - panelSize.width - viewportPadding),
  )
  const top = Math.max(
    viewportPadding,
    Math.min(y + 12, viewport.height - panelSize.height - viewportPadding),
  )

  const cancelEditing = () => {
    if (!data || isPending) return
    resetDraft(data)
    setStatusMessage('')
    setIsEditing(false)
  }

  const handleSave = () => {
    if (!data || isPending) return
    const previousIds = new Set(data.memberships.map(item => item.id))
    const membershipsChanged =
      previousIds.size !== wordbookIds.size ||
      Array.from(previousIds).some(id => !wordbookIds.has(id))
    setStatusMessage('正在保存…')
    startTransition(async () => {
      const result = await updateVocabularyFromInspector({
        id: data.id,
        pronunciations: splitLines(pronunciations),
        partsOfSpeech: splitLines(partsOfSpeech),
        meanings: splitLines(meanings),
        wordbookIds: Array.from(wordbookIds),
        definitions,
      })
      if (!result.success) {
        setStatusMessage(result.message)
        return
      }
      const nextData: VocabularyInspectorData = {
        ...data,
        pronunciations: result.meta.pronunciations,
        partsOfSpeech: result.meta.partsOfSpeech,
        meanings: result.meta.meanings,
        wordAudio: result.meta.wordAudio || null,
        memberships: data.availableWordbooks.filter(item => wordbookIds.has(item.id)),
        definitions: definitions
          .filter(item => item.definition.trim())
          .map((definition, index) => ({ ...definition, id: `saved-${index}` })),
      }
      setData(nextData)
      resetDraft(nextData)
      setStatusMessage('')
      setIsEditing(false)
      onSaved?.({ word: data.word, meta: result.meta, membershipsChanged })
    })
  }

  return (
    <aside
      ref={panelRef}
      role='dialog'
      aria-label={`${word} 的单词本信息`}
      data-highlight-ignore='true'
      style={{ left, top, isolation: 'isolate' }}
      className='ui-pop fixed z-[70] flex max-h-[min(34rem,calc(100vh-1.5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.22)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'>
      <header className='shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
              <h2 className='text-xl font-bold tracking-tight'>{data?.word || word}</h2>
              <WordAudioButton
                key={data?.wordAudio || 'no-word-audio'}
                audioFile={data?.wordAudio}
                word={data?.word || word}
              />
              {data?.pronunciations[0] ? (
                <span className='text-sm text-slate-500 dark:text-slate-400'>
                  {data.pronunciations.join('・')}
                </span>
              ) : null}
            </div>
            {data?.partsOfSpeech.length ? (
              <div className='mt-1.5 flex flex-wrap gap-1.5' aria-label='词性'>
                {data.partsOfSpeech.map(partOfSpeech => (
                  <span
                    key={partOfSpeech}
                    className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'>
                    {partOfSpeech}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type='button'
            onClick={onClose}
            disabled={isPending}
            aria-label='关闭单词信息'
            className='flex size-8 shrink-0 items-center justify-center rounded-md text-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'>
            ×
          </button>
        </div>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-4 dark:bg-slate-950'>
        {!data ? (
          <p className='py-4 text-center text-sm text-slate-500'>{loadMessage}</p>
        ) : isEditing ? (
          <Editor
            data={data}
            pronunciations={pronunciations}
            partsOfSpeech={partsOfSpeech}
            meanings={meanings}
            wordbookIds={wordbookIds}
            definitions={definitions}
            setPronunciations={setPronunciations}
            setPartsOfSpeech={setPartsOfSpeech}
            setMeanings={setMeanings}
            setWordbookIds={setWordbookIds}
            setDefinitions={setDefinitions}
          />
        ) : (
          <WordSummary data={data} />
        )}
      </div>

      {data ? (
        <footer className='flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900'>
          <p aria-live='polite' className='min-w-0 truncate text-xs text-slate-500'>
            {statusMessage}
          </p>
          {isEditing ? (
            <div className='flex shrink-0 gap-2'>
              <button type='button' onClick={cancelEditing} disabled={isPending} className='ui-btn ui-btn-sm'>
                取消
              </button>
              <button
                type='button'
                onClick={handleSave}
                disabled={isPending}
                className='ui-btn ui-btn-primary ui-btn-sm disabled:cursor-wait disabled:opacity-60'>
                {isPending ? '保存中…' : '保存'}
              </button>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => setIsEditing(true)}
              className='ui-btn ui-btn-primary ui-btn-sm shrink-0'>
              编辑词条
            </button>
          )}
        </footer>
      ) : null}
    </aside>
  )
}

function WordSummary({ data }: { data: VocabularyInspectorData }) {
  return (
    <div className='space-y-4'>
      <section>
        <h3 className='mb-2 text-[11px] font-bold tracking-wider text-slate-400'>释义</h3>
        {data.meanings.length ? (
          <div>
            <p className='mb-1 text-[11px] font-semibold text-slate-400'>词书</p>
            <ul className='space-y-1.5 text-[15px] leading-6 text-slate-900 dark:text-slate-100'>
            {data.meanings.map(meaning => (
              <li key={meaning} className='flex gap-2'>
                <span className='mt-[0.65rem] size-1 shrink-0 rounded-full bg-slate-400' />
                <span>{meaning}</span>
              </li>
            ))}
            </ul>
          </div>
        ) : (
          <p className='text-sm text-slate-400'>尚未填写词书释义</p>
        )}

      {data.definitions.length ? (
        <div className='mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800'>
          {data.definitions.map(definition => (
            <article key={definition.id} className='border-l-2 border-slate-200 pl-3 dark:border-slate-700'>
              <p className='mb-1 text-[11px] font-semibold text-slate-500'>
                {definition.dictionaryName || '辞典'} · {definition.language === 'JA' ? '日本語' : '中文'}
              </p>
              <p className='whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200'>
                {definition.definition}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      </section>

      <section className='border-t border-slate-100 pt-4 dark:border-slate-800'>
        <h3 className='mb-2 text-[11px] font-bold tracking-wider text-slate-400'>
          例句
        </h3>
        {data.sentences.length ? (
          <ol className='space-y-3'>
            {data.sentences.map((sentence, index) => (
              <li
                key={`${sentence.text}-${index}`}
                className='border-l-2 border-slate-200 pl-3 dark:border-slate-700'>
                <p className='text-sm leading-6 text-slate-800 dark:text-slate-100'>
                  {sentence.text}
                </p>
                {sentence.translation ? (
                  <p className='mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400'>
                    {sentence.translation}
                  </p>
                ) : null}
                {sentence.source || sentence.posTags.length ? (
                  <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400'>
                    {sentence.source ? <span>{sentence.source}</span> : null}
                    {sentence.posTags.map(tag => (
                      <span
                        key={tag}
                        className='rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400'>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className='text-sm text-slate-400'>暂无例句</p>
        )}
      </section>

      <section className='border-t border-slate-100 pt-4 dark:border-slate-800'>
        <h3 className='mb-2 text-[11px] font-bold tracking-wider text-slate-400'>所属单词本</h3>
        {data.memberships.length ? (
          <div className='flex flex-wrap gap-1.5'>
            {data.memberships.map(item => (
              <span
                key={item.id}
                className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'>
                {item.label}
              </span>
            ))}
          </div>
        ) : (
          <p className='text-sm text-slate-400'>未归入单词本</p>
        )}
      </section>
    </div>
  )
}

type EditorProps = {
  data: VocabularyInspectorData
  pronunciations: string
  partsOfSpeech: string
  meanings: string
  wordbookIds: Set<string>
  definitions: VocabularyDefinitionDraft[]
  setPronunciations: (value: string) => void
  setPartsOfSpeech: (value: string) => void
  setMeanings: (value: string) => void
  setWordbookIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setDefinitions: React.Dispatch<React.SetStateAction<VocabularyDefinitionDraft[]>>
}

function Editor(props: EditorProps) {
  const {
    data,
    pronunciations,
    partsOfSpeech,
    meanings,
    wordbookIds,
    definitions,
    setPronunciations,
    setPartsOfSpeech,
    setMeanings,
    setWordbookIds,
    setDefinitions,
  } = props
  return (
    <div className='space-y-5'>
      <section className='space-y-2'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className={LABEL_CLASS}>所属单词本</h3>
          <span className='text-[11px] text-slate-400'>已选 {wordbookIds.size} 本</span>
        </div>
        <div className='max-h-36 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700'>
          {data.availableWordbooks.map(wordbook => (
            <label
              key={wordbook.id}
              className='flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'>
              <input
                type='checkbox'
                checked={wordbookIds.has(wordbook.id)}
                onChange={() =>
                  setWordbookIds(current => {
                    const next = new Set(current)
                    if (next.has(wordbook.id)) next.delete(wordbook.id)
                    else next.add(wordbook.id)
                    return next
                  })
                }
                className='size-4 accent-slate-900'
              />
              <span>{wordbook.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className='grid grid-cols-2 gap-3'>
        <Field label='读音' value={pronunciations} onChange={setPronunciations} placeholder='每行一个读音' rows={2} />
        <Field label='词性' value={partsOfSpeech} onChange={setPartsOfSpeech} placeholder='每行一个词性' rows={2} />
      </div>
      <Field label='词书释义' value={meanings} onChange={setMeanings} placeholder='每行一条释义' rows={3} />

      <section className='space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h3 className={LABEL_CLASS}>按来源补充释义</h3>
            <p className='mt-0.5 text-[11px] text-slate-400'>可选；用于保留辞典来源和原始语言</p>
          </div>
          <button
            type='button'
            onClick={() =>
              setDefinitions(current => [
                ...current,
                { language: 'ZH', dictionaryName: '', definition: '' },
              ])
            }
            className='ui-btn ui-btn-sm'>
            添加
          </button>
        </div>
        {definitions.length === 0 ? (
          <p className='rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700'>
            暂无按来源补充的释义
          </p>
        ) : (
          <div className='space-y-3'>
            {definitions.map((definition, index) => (
              <div key={index} className='space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70'>
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-xs font-semibold text-slate-500'>释义 {index + 1}</span>
                  <button
                    type='button'
                    aria-label={`删除第 ${index + 1} 条补充释义`}
                    onClick={() =>
                      setDefinitions(current => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className='shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 dark:hover:bg-rose-950/40'>
                    删除
                  </button>
                </div>
                <div className='grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2'>
                  <CustomSelect
                    value={definition.language}
                    onChange={event =>
                      setDefinitions(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, language: event.target.value === 'JA' ? 'JA' : 'ZH' }
                            : item,
                        ),
                      )
                    }
                    aria-label={`第 ${index + 1} 条释义语言`}
                    className={`${FIELD_CLASS} h-10 min-w-0`}>
                    <option value='ZH'>中文</option>
                    <option value='JA'>日本語</option>
                  </CustomSelect>
                  <input
                    value={definition.dictionaryName}
                    onChange={event =>
                      setDefinitions(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, dictionaryName: event.target.value } : item,
                        ),
                      )
                    }
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                    placeholder='辞典 / 来源'
                  />
                </div>
                <textarea
                  value={definition.definition}
                  onChange={event =>
                    setDefinitions(current =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, definition: event.target.value } : item,
                      ),
                    )
                  }
                  rows={3}
                  className={`${FIELD_CLASS} resize-y`}
                  placeholder={definition.language === 'ZH' ? '输入中文释义' : '日本語の語釈を入力'}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  rows: number
}) {
  return (
    <label className='block space-y-1.5'>
      <span className={LABEL_CLASS}>{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={rows}
        className={`${FIELD_CLASS} resize-y`}
        placeholder={placeholder}
      />
    </label>
  )
}
