'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  deleteVocabularyAdmin,
  getAllVocabulariesAdmin,
  updateVocabularyMetaAdmin,
} from '../searchActions'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

type VocabularyRecord = {
  id: string
  word: string
  sourceType: 'AUDIO_DIALOGUE' | 'ARTICLE_TEXT' | 'QUIZ_QUESTION'
  sentences: SentenceRecord[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type SentenceRecord = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
  posTags?: string[]
}

const splitUserInput = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const SourceBadge = ({ type }: { type: VocabularyRecord['sourceType'] }) => {
  if (type === 'AUDIO_DIALOGUE') {
    return (
      <span className='inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700'>
        听力
      </span>
    )
  }
  if (type === 'ARTICLE_TEXT') {
    return (
      <span className='inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700'>
        阅读
      </span>
    )
  }
  return (
    <span className='inline-flex items-center rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700'>
      题目
    </span>
  )
}

const deleteButtonClassName =
  'rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100'

export default function VocabularyManagePage() {
  const dialog = useDialog()
  const [vocabList, setVocabList] = useState<VocabularyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pronunciationsInput, setPronunciationsInput] = useState('')
  const [partsOfSpeechInput, setPartsOfSpeechInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const pronunciationsPreview = splitUserInput(pronunciationsInput)
  const partsOfSpeechPreview = splitUserInput(partsOfSpeechInput)
  const meaningPreview = splitUserInput(meaningInput)

  const fetchVocabs = async () => {
    setLoading(true)
    const data = await getAllVocabulariesAdmin()
    setVocabList(data as VocabularyRecord[])
    setLoading(false)
  }

  useEffect(() => {
    fetchVocabs()
  }, [])

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setViewMode('card')
    }
  }, [])

  const totalMeanings = useMemo(
    () => vocabList.reduce((acc, item) => acc + item.meanings.length, 0),
    [vocabList],
  )
  const filteredList = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return vocabList
    return vocabList.filter(item => {
      const sentenceText = (item.sentences || [])
        .map(sentence => `${sentence.text} ${sentence.source}`)
        .join(' ')
      const haystack = [
        item.word,
        item.pronunciations.join(' '),
        item.partsOfSpeech.join(' '),
        item.meanings.join(' '),
        sentenceText,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [searchKeyword, vocabList])

  const openEditor = (item: VocabularyRecord) => {
    setEditingId(item.id)
    setPronunciationsInput(item.pronunciations.join('\n'))
    setPartsOfSpeechInput(item.partsOfSpeech.join('\n'))
    setMeaningInput(item.meanings.join('\n'))
  }

  const handleDeleteVocab = async (id: string, word: string) => {
    const res = await deleteVocabularyAdmin(id)
    if (!res.success) {
      dialog.toast(res.message || `删除 "${word}" 失败`, { tone: 'error' })
      return
    }
    setVocabList(prev => prev.filter(item => item.id !== id))
    dialog.toast('已删除', { tone: 'success' })
  }

  const handleSave = async (item: VocabularyRecord) => {
    const pronunciations = splitUserInput(pronunciationsInput)
    const partsOfSpeech = splitUserInput(partsOfSpeechInput)
    const meanings = splitUserInput(meaningInput)
    setSavingId(item.id)
    const res = await updateVocabularyMetaAdmin(item.id, {
      pronunciations,
      partsOfSpeech,
      meanings,
    })
    setSavingId(null)

    if (!res.success) {
      await dialog.alert(res.message || '保存失败')
      return
    }

    setVocabList(prev =>
      prev.map(current =>
        current.id === item.id
          ? {
              ...current,
              pronunciations,
              partsOfSpeech,
              meanings,
            }
          : current,
      ),
    )
    setEditingId(null)
    dialog.toast('保存成功', { tone: 'success' })
  }

  return (
    <div className='mx-auto max-w-6xl p-4 pb-24 md:p-8'>
      <div className='mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div>
          <h1 className='text-2xl font-black text-gray-900'>词库管理</h1>
          <p className='mt-1 text-sm text-gray-500'>维护单词注音和释义，可多值保存。</p>
        </div>
        <div className='flex flex-col gap-2'>
          <div className='grid grid-cols-2 gap-2 text-sm'>
            <div className='rounded-xl border border-gray-200 bg-white px-3 py-2'>
              <p className='text-xs text-gray-500'>词条</p>
              <p className='text-lg font-bold text-gray-900'>{vocabList.length}</p>
            </div>
            <div className='rounded-xl border border-gray-200 bg-white px-3 py-2'>
              <p className='text-xs text-gray-500'>释义总数</p>
              <p className='text-lg font-bold text-gray-900'>{totalMeanings}</p>
            </div>
          </div>
          <div className='inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 md:w-auto'>
            <button
              type='button'
              onClick={() => setViewMode('card')}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'card'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              卡片
            </button>
            <button
              type='button'
              onClick={() => setViewMode('table')}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'table'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              表格
            </button>
          </div>
        </div>
      </div>

      <div className='mb-4 rounded-xl border border-gray-200 bg-white p-3 md:p-4'>
        <label className='mb-1 block text-xs font-bold text-gray-500'>
          搜索词条
        </label>
        <input
          type='text'
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.currentTarget.value)}
          placeholder='支持搜索单词、注音、词性、释义、例句来源'
          className='w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
        />
        <p className='mt-1 text-xs text-gray-400'>
          共 {vocabList.length} 条，当前匹配 {filteredList.length} 条
        </p>
      </div>

      <div className='rounded-2xl border border-gray-200 bg-white shadow-sm'>
        {loading ? (
          <div className='py-16 text-center text-sm text-gray-500'>加载中...</div>
        ) : viewMode === 'card' ? (
          <div className='space-y-3 p-3 md:p-4'>
            {filteredList.map(item => {
              const displayPronunciations = item.pronunciations
              const displayPartsOfSpeech = item.partsOfSpeech
              const displayMeanings = item.meanings
              const isEditing = editingId === item.id
              const isSaving = savingId === item.id
              const sentenceList = item.sentences || []

              return (
                <article
                  key={item.id}
                  className='rounded-2xl border border-gray-200 bg-gray-50/60 p-3 md:p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <p className='text-xl font-black text-gray-900'>{item.word}</p>
                      <div className='mt-1'>
                        <SourceBadge type={item.sourceType} />
                      </div>
                    </div>
                    <div className='inline-flex items-center gap-2'>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(item)}
                            disabled={isSaving}
                            className='rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60'>
                            {isSaving ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className='rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600'>
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openEditor(item)}
                            className='rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700'>
                            编辑
                          </button>
                          <InlineConfirmAction
                            message={`删除 "${item.word}" 后不可恢复，确认删除吗？`}
                            onConfirm={() => handleDeleteVocab(item.id, item.word)}
                            triggerLabel='删除'
                            confirmLabel='确认删除'
                            pendingLabel='删除中...'
                            triggerClassName={deleteButtonClassName}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <div className='mt-3 space-y-2'>
                    <section className='rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500'>
                        注音 / 音标
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={pronunciationsInput}
                            onChange={e =>
                              setPronunciationsInput(e.currentTarget.value)
                            }
                            rows={3}
                            placeholder='每行一个，或使用逗号分隔'
                            className='w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {pronunciationsPreview.length > 0 ? (
                              pronunciationsPreview.map(pron => (
                                <span
                                  key={`${item.id}-pron-preview-card-${pron}`}
                                  className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                                  {pron}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-indigo-300'>
                                尚未识别到注音项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayPronunciations.length ? (
                            displayPronunciations.map(pron => (
                              <span
                                key={`${item.id}-pron-card-${pron}`}
                                className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                                {pron}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>未设置</span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className='rounded-xl border border-amber-100 bg-amber-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700'>
                        词性
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={partsOfSpeechInput}
                            onChange={e => setPartsOfSpeechInput(e.currentTarget.value)}
                            rows={3}
                            placeholder='例如: n. / vt.'
                            className='w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-amber-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {partsOfSpeechPreview.length > 0 ? (
                              partsOfSpeechPreview.map(pos => (
                                <span
                                  key={`${item.id}-pos-preview-card-${pos}`}
                                  className='rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700'>
                                  {pos}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-amber-300'>
                                尚未识别到词性项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayPartsOfSpeech.length ? (
                            displayPartsOfSpeech.map(pos => (
                              <span
                                key={`${item.id}-pos-card-${pos}`}
                                className='rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700'>
                                {pos}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>未设置</span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className='rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600'>
                        释义
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={meaningInput}
                            onChange={e => setMeaningInput(e.currentTarget.value)}
                            rows={3}
                            placeholder='每行一个释义'
                            className='w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-emerald-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {meaningPreview.length > 0 ? (
                              meaningPreview.map(meaning => (
                                <span
                                  key={`${item.id}-meaning-preview-card-${meaning}`}
                                  className='rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
                                  {meaning}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-emerald-300'>
                                尚未识别到释义项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayMeanings.length ? (
                            displayMeanings.map(meaning => (
                              <span
                                key={`${item.id}-meaning-card-${meaning}`}
                                className='rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'>
                                {meaning}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>未设置</span>
                          )}
                        </div>
                      )}
                    </section>
                  </div>

                  <div className='mt-3'>
                    {sentenceList.length === 0 ? (
                      <p className='text-xs text-gray-400'>暂无例句</p>
                    ) : (
                      <div className='space-y-1.5'>
                        {sentenceList.slice(0, 2).map((sentence, idx) => (
                          <div
                            key={`${item.id}-sentence-card-${idx}`}
                            className='rounded-lg border border-gray-200 bg-white px-2.5 py-2'>
                            <p className='text-xs leading-relaxed text-gray-700 line-clamp-2'>
                              {sentence.text}
                            </p>
                            <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                              <span className='rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500'>
                                {sentence.source}
                              </span>
                              {typeof sentence.meaningIndex === 'number' && (
                                <span className='rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700'>
                                  释义 {sentence.meaningIndex + 1}
                                </span>
                              )}
                              {(sentence.posTags || []).slice(0, 1).map(tag => (
                                <span
                                  key={`${item.id}-sentence-card-tag-${idx}-${tag}`}
                                  className='rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700'>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {sentenceList.length > 2 && (
                          <p className='px-1 text-[10px] font-medium text-gray-400'>
                            还有 {sentenceList.length - 2} 条例句
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {filteredList.length === 0 && (
              <div className='py-16 text-center text-gray-400'>
                {searchKeyword.trim() ? '没有匹配的词条' : '暂无词条'}
              </div>
            )}
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[860px] text-left text-sm text-gray-700'>
              <colgroup>
                <col className='w-[30%]' />
                <col className='w-[16%]' />
                <col className='w-[14%]' />
                <col className='w-[20%]' />
                <col className='w-[8%]' />
                <col className='w-[12%]' />
              </colgroup>
              <thead className='sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500'>
                <tr>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>单词</th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>注音</th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>词性</th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>释义</th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>来源</th>
                  <th className='border-b border-gray-200 px-4 py-3.5 text-right font-bold'>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map(item => {
                  const displayPronunciations = item.pronunciations
                  const displayPartsOfSpeech = item.partsOfSpeech
                  const displayMeanings = item.meanings
                  const isEditing = editingId === item.id
                  const isSaving = savingId === item.id

                  return (
                    <tr
                      key={item.id}
                      className='border-b border-gray-100 align-top odd:bg-white even:bg-gray-50/45 hover:bg-indigo-50/30'>
                      <td className='px-4 py-3.5'>
                        <div className='font-bold text-gray-900'>{item.word}</div>
                        {(() => {
                          const sentenceList = item.sentences || []
                          if (sentenceList.length === 0) {
                            return (
                              <p className='mt-1 text-xs text-gray-400'>暂无例句</p>
                            )
                          }
                          return (
                            <div className='mt-2 space-y-1.5 max-w-md'>
                              {sentenceList.slice(0, 2).map((sentence, idx) => (
                                <div
                                  key={`${item.id}-sentence-${idx}`}
                                  className='rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2'>
                                  <p className='text-xs text-gray-700 leading-relaxed line-clamp-2'>
                                    {sentence.text}
                                  </p>
                                  <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                                    <span className='rounded-md bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500'>
                                      {sentence.source}
                                    </span>
                                    {typeof sentence.meaningIndex === 'number' && (
                                      <span className='rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700'>
                                        释义 {sentence.meaningIndex + 1}
                                      </span>
                                    )}
                                    {(sentence.posTags || []).slice(0, 1).map(tag => (
                                      <span
                                        key={`${item.id}-sentence-${idx}-tag-${tag}`}
                                        className='rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700'>
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {sentenceList.length > 2 && (
                                <p className='text-[10px] font-medium text-gray-400 px-1'>
                                  还有 {sentenceList.length - 2} 条例句
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-64 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500'>
                              注音 / 音标
                            </p>
                            <textarea
                              value={pronunciationsInput}
                              onChange={e =>
                                setPronunciationsInput(e.currentTarget.value)
                              }
                              rows={3}
                              placeholder='每行一个，或使用逗号分隔'
                              className='w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                            />
                            <div className='mt-2 flex flex-wrap gap-1.5'>
                              {pronunciationsPreview.length > 0 ? (
                                pronunciationsPreview.map(pron => (
                                  <span
                                    key={`${item.id}-pron-preview-${pron}`}
                                    className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                                    {pron}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-indigo-300'>
                                  尚未识别到注音项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-56 flex-wrap gap-1.5'>
                            {displayPronunciations.length ? (
                              displayPronunciations.map(pron => (
                                <span
                                  key={`${item.id}-pron-${pron}`}
                                  className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                                  {pron}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>未设置</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-48 rounded-xl border border-amber-100 bg-amber-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700'>
                              词性
                            </p>
                            <textarea
                              value={partsOfSpeechInput}
                              onChange={e =>
                                setPartsOfSpeechInput(e.currentTarget.value)
                              }
                              rows={3}
                              placeholder='例如: n.\nvt.'
                              className='w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-amber-400'
                            />
                            <div className='mt-2 flex max-w-44 flex-wrap gap-1.5'>
                              {partsOfSpeechPreview.length > 0 ? (
                                partsOfSpeechPreview.map(pos => (
                                  <span
                                    key={`${item.id}-pos-preview-${pos}`}
                                    className='rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700'>
                                    {pos}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-amber-300'>
                                  尚未识别到词性项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-44 flex-wrap gap-1.5'>
                            {displayPartsOfSpeech.length ? (
                              displayPartsOfSpeech.map(pos => (
                                <span
                                  key={`${item.id}-pos-${pos}`}
                                  className='rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700'>
                                  {pos}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>未设置</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-72 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600'>
                              释义
                            </p>
                            <textarea
                              value={meaningInput}
                              onChange={e => setMeaningInput(e.currentTarget.value)}
                              rows={3}
                              placeholder='每行一个释义，支持多个词义'
                              className='w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-emerald-400'
                            />
                            <div className='mt-2 flex max-w-64 flex-wrap gap-1.5'>
                              {meaningPreview.length > 0 ? (
                                meaningPreview.map(meaning => (
                                  <span
                                    key={`${item.id}-meaning-preview-${meaning}`}
                                    className='rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
                                    {meaning}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-emerald-300'>
                                  尚未识别到释义项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-64 flex-wrap gap-1.5'>
                            {displayMeanings.length ? (
                              displayMeanings.map(meaning => (
                                <span
                                  key={`${item.id}-meaning-${meaning}`}
                                  className='rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'>
                                  {meaning}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>未设置</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        <SourceBadge type={item.sourceType} />
                      </td>
                      <td className='px-4 py-3.5 text-right'>
                        <div className='inline-flex min-w-[132px] items-center justify-end gap-2 whitespace-nowrap'>
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSave(item)}
                                disabled={isSaving}
                                className='rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60'>
                                {isSaving ? '保存中...' : '保存'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className='rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600'>
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditor(item)}
                                className='rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700'>
                                编辑
                              </button>
                              <InlineConfirmAction
                                message={`删除 "${item.word}" 后不可恢复，确认删除吗？`}
                                onConfirm={() => handleDeleteVocab(item.id, item.word)}
                                triggerLabel='删除'
                                confirmLabel='确认删除'
                                pendingLabel='删除中...'
                                triggerClassName={deleteButtonClassName}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan={6} className='py-16 text-center text-gray-400'>
                      {searchKeyword.trim() ? '没有匹配的词条' : '暂无词条'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
