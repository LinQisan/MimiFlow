'use client'

import { useActionState } from 'react'

import { updateShadowingMaterial } from './actions'

type Props = {
  legacyId: string
  materialId: string
  title: string
  audioFile: string
  description: string
  transcript: string
  source: string
  language: string
  difficulty: string
  tags: string
  materialType: 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR'
  collectionId: string
  favoriteCollections: Array<{ id: string; title: string }>
}

const initialState = { success: false, message: '' }

export default function ShadowingMetaForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      updateShadowingMaterial(formData),
    initialState,
  )

  return (
    <form action={formAction} className='space-y-3'>
      <input type='hidden' name='legacyId' value={props.legacyId} />
      <input type='hidden' name='materialId' value={props.materialId} />
      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
        <input
          name='title'
          defaultValue={props.title}
          placeholder='标题'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='audioFile'
          defaultValue={props.audioFile}
          placeholder='/audios/xxx.mp3'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='source'
          defaultValue={props.source}
          placeholder='来源'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='language'
          defaultValue={props.language}
          placeholder='语言（例：ja-JP / en-US）'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='difficulty'
          defaultValue={props.difficulty}
          placeholder='难度'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='tags'
          defaultValue={props.tags}
          placeholder='标签，逗号分隔'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
      </div>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]'>
        <select
          name='materialType'
          defaultValue={props.materialType}
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
          <option value='SPEAKING'>SPEAKING（跟读）</option>
          <option value='LISTENING'>LISTENING（听力）</option>
          <option value='READING'>READING（阅读）</option>
          <option value='VOCAB_GRAMMAR'>VOCAB_GRAMMAR（题库）</option>
        </select>
        <div className='flex h-10 items-center text-xs font-semibold text-slate-500'>
          提示：改成非 `SPEAKING` 后，该材料将不再出现在跟读页。
        </div>
      </div>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]'>
        <select
          id='shadowing-favorite-collection'
          name='collectionId'
          defaultValue={props.collectionId}
          aria-label='收藏夹归属'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
          <option value=''>保持当前归属（不变）</option>
          <optgroup label='移动到已有收藏夹'>
            {props.favoriteCollections.map(item => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          name='newFavoriteName'
          placeholder='新建收藏夹名称（可选，填写后优先使用）'
          aria-label='新建收藏夹名称'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
      </div>
      <textarea
        name='description'
        defaultValue={props.description}
        placeholder='描述'
        className='min-h-20 w-full resize-y border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <textarea
        name='transcript'
        defaultValue={props.transcript}
        placeholder='全文文本'
        className='min-h-24 w-full resize-y border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <div className='flex items-center gap-3'>
        <button
          type='submit'
          disabled={pending}
          className='h-10 border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'>
          {pending ? '保存中...' : '保存听力属性'}
        </button>
        {state.message ? (
          <p
            className={`text-xs font-semibold ${
              state.success ? 'text-blue-700' : 'text-rose-600'
            }`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
