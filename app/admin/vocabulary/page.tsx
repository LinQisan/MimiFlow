'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  deleteVocabularyAdmin,
  getAllVocabulariesAdmin,
  updateVocabularyMetaAdmin,
} from '../searchActions'
import { useDialog } from '@/context/DialogContext'

type VocabularyRecord = {
  id: string
  word: string
  sourceType: 'AUDIO_DIALOGUE' | 'ARTICLE_TEXT' | 'QUIZ_QUESTION'
  contextSentence: string
  pronunciation?: string | null
  pronunciations?: string | null
  partOfSpeech?: string | null
  partsOfSpeech?: string | null
  meanings?: string | null
}

const parseList = (raw?: string | null) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
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

export default function VocabularyManagePage() {
  const dialog = useDialog()
  const [vocabList, setVocabList] = useState<VocabularyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pronInput, setPronInput] = useState('')
  const [posInput, setPosInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const pronunciationPreview = splitUserInput(pronInput)
  const partOfSpeechPreview = splitUserInput(posInput)
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

  const totalMeanings = useMemo(
    () =>
      vocabList.reduce((acc, item) => acc + parseList(item.meanings).length, 0),
    [vocabList],
  )

  const openEditor = (item: VocabularyRecord) => {
    setEditingId(item.id)
    const list = parseList(item.pronunciations)
    const merged = list.length
      ? list
      : item.pronunciation
        ? [item.pronunciation]
        : []
    const posList = parseList(item.partsOfSpeech)
    const mergedPos = posList.length
      ? posList
      : item.partOfSpeech
        ? [item.partOfSpeech]
        : []
    setPronInput(merged.join('\n'))
    setPosInput(mergedPos.join('\n'))
    setMeaningInput(parseList(item.meanings).join('\n'))
  }

  const handleDeleteVocab = async (id: string, word: string) => {
    const shouldDelete = await dialog.confirm(`确定删除 "${word}" 吗？`, {
      title: '删除单词',
      danger: true,
      confirmText: '删除',
    })
    if (!shouldDelete) return

    const res = await deleteVocabularyAdmin(id)
    if (!res.success) {
      await dialog.alert(res.message || '删除失败')
      return
    }
    setVocabList(prev => prev.filter(item => item.id !== id))
  }

  const handleSave = async (item: VocabularyRecord) => {
    const pronunciations = splitUserInput(pronInput)
    const partsOfSpeech = splitUserInput(posInput)
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
              pronunciation: pronunciations[0] || null,
              pronunciations: pronunciations.length
                ? JSON.stringify(pronunciations)
                : null,
              partOfSpeech: partsOfSpeech[0] || null,
              partsOfSpeech: partsOfSpeech.length
                ? JSON.stringify(partsOfSpeech)
                : null,
              meanings: meanings.length ? JSON.stringify(meanings) : null,
            }
          : current,
      ),
    )
    setEditingId(null)
  }

  return (
    <div className='mx-auto max-w-6xl p-4 pb-24 md:p-8'>
      <div className='mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div>
          <h1 className='text-2xl font-black text-gray-900'>词库管理</h1>
          <p className='mt-1 text-sm text-gray-500'>维护单词注音和释义，可多值保存。</p>
        </div>
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
      </div>

      <div className='overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
        {loading ? (
          <div className='py-16 text-center text-sm text-gray-500'>加载中...</div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full text-left text-sm text-gray-700'>
              <thead className='bg-gray-50 text-xs uppercase tracking-wide text-gray-500'>
                <tr>
                  <th className='px-4 py-3'>单词</th>
                  <th className='px-4 py-3'>注音</th>
                  <th className='px-4 py-3'>词性</th>
                  <th className='px-4 py-3'>释义</th>
                  <th className='px-4 py-3'>来源</th>
                  <th className='px-4 py-3 text-right'>操作</th>
                </tr>
              </thead>
              <tbody>
                {vocabList.map(item => {
                  const pronunciationList = parseList(item.pronunciations)
                  const displayPron = pronunciationList.length
                    ? pronunciationList
                    : item.pronunciation
                      ? [item.pronunciation]
                      : []
                  const partOfSpeechList = parseList(item.partsOfSpeech)
                  const displayPos = partOfSpeechList.length
                    ? partOfSpeechList
                    : item.partOfSpeech
                      ? [item.partOfSpeech]
                      : []
                  const meaningList = parseList(item.meanings)
                  const isEditing = editingId === item.id
                  const isSaving = savingId === item.id

                  return (
                    <tr
                      key={item.id}
                      className='border-t border-gray-100 align-top hover:bg-gray-50/60'>
                      <td className='px-4 py-4'>
                        <div className='font-bold text-gray-900'>{item.word}</div>
                        <p className='mt-1 line-clamp-2 text-xs text-gray-500'>
                          {item.contextSentence || '暂无上下文'}
                        </p>
                      </td>
                      <td className='px-4 py-4'>
                        {isEditing ? (
                          <div className='w-64 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500'>
                              注音 / 音标
                            </p>
                            <textarea
                              value={pronInput}
                              onChange={e => setPronInput(e.currentTarget.value)}
                              rows={3}
                              placeholder='每行一个，或使用逗号分隔'
                              className='w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                            />
                            <div className='mt-2 flex flex-wrap gap-1.5'>
                              {pronunciationPreview.length > 0 ? (
                                pronunciationPreview.map(pron => (
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
                            {displayPron.length ? (
                              displayPron.map(pron => (
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
                      <td className='px-4 py-4'>
                        {isEditing ? (
                          <div className='w-48 rounded-xl border border-amber-100 bg-amber-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700'>
                              词性
                            </p>
                            <textarea
                              value={posInput}
                              onChange={e => setPosInput(e.currentTarget.value)}
                              rows={3}
                              placeholder='例如: n.\nvt.'
                              className='w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-amber-400'
                            />
                            <div className='mt-2 flex max-w-44 flex-wrap gap-1.5'>
                              {partOfSpeechPreview.length > 0 ? (
                                partOfSpeechPreview.map(pos => (
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
                            {displayPos.length ? (
                              displayPos.map(pos => (
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
                      <td className='px-4 py-4'>
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
                            {meaningList.length ? (
                              meaningList.map(meaning => (
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
                      <td className='px-4 py-4'>
                        <SourceBadge type={item.sourceType} />
                      </td>
                      <td className='px-4 py-4 text-right'>
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
                              <button
                                onClick={() => handleDeleteVocab(item.id, item.word)}
                                className='rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600'>
                                删除
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {vocabList.length === 0 && (
                  <tr>
                    <td colSpan={6} className='py-16 text-center text-gray-400'>
                      暂无词条
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
