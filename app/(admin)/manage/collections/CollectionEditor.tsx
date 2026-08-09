'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  clearEmptyCollections,
  deleteCollection,
  deleteCollectionMaterial,
  updateCollectionAttributes,
} from '@/features/collections/actions'
import CustomSelect from '@/components/ui/CustomSelect'
import { useDialog } from '@/context/DialogContext'

type ActionState = { success: boolean; message: string }

const initialState: ActionState = { success: false, message: '' }

export function CollectionEditor({
  collection,
  parentOptions,
  canDelete,
}: {
  collection: {
    id: string
    title: string
    description: string | null
    language: string | null
    level: string | null
    parentId: string | null
    sortOrder: number
  }
  parentOptions: { id: string; label: string }[]
  canDelete: boolean
}) {
  const router = useRouter()
  const dialog = useDialog()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => {
      const result = await updateCollectionAttributes(formData)
      if (result.success) router.refresh()
      return result
    },
    initialState,
  )

  return (
    <div className='border-t border-slate-200 p-3'>
      <form action={formAction} className='space-y-3'>
        <input type='hidden' name='collectionId' value={collection.id} />
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            名称
            <input
              name='title'
              defaultValue={collection.title}
              required
              className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </label>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            上级位置
            <CustomSelect
              name='parentId'
              defaultValue={collection.parentId || ''}
              className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
              <option value=''>顶层</option>
              {parentOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            语言
            <input
              name='language'
              defaultValue={collection.language || ''}
              placeholder='例如：ja'
              className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </label>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            等级
            <input
              name='level'
              defaultValue={collection.level || ''}
              placeholder='例如：N1'
              className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </label>
        </div>
        <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_8rem]'>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            描述
            <textarea
              name='description'
              defaultValue={collection.description || ''}
              placeholder='可选'
              className='mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </label>
          <label className='space-y-1 text-xs font-semibold text-slate-600'>
            排序
            <input
              type='number'
              name='sortOrder'
              defaultValue={collection.sortOrder}
              className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </label>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3'>
          <p
            aria-live='polite'
            className={`text-xs ${
              state.success ? 'text-emerald-700' : 'text-rose-700'
            }`}>
            {state.message || '修改后点击保存，材料内容不会被改动。'}
          </p>
          <div className='flex items-center gap-2'>
            {canDelete && (
              <button
                type='button'
                disabled={pending || isDeleting}
                onClick={() => {
                  void dialog
                    .confirm(`确认删除“${collection.title}”？此操作不可恢复。`, {
                      title: '删除空分类',
                      confirmText: '删除',
                      danger: true,
                    })
                    .then(ok => {
                      if (!ok) return
                      startDeleteTransition(() => {
                        void deleteCollection(collection.id).then(result => {
                          dialog.toast(result.message, {
                            tone: result.success ? 'success' : 'error',
                          })
                          if (result.success) router.refresh()
                        })
                      })
                    })
                }}
                className='ui-btn ui-btn-sm border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60'>
                {isDeleting ? '删除中…' : '删除空分类'}
              </button>
            )}
            <button
              type='submit'
              disabled={pending || isDeleting}
              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-60'>
              {pending ? '保存中…' : '保存结构'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function DeleteCollectionButton({
  id,
  title,
  canDelete,
}: {
  id: string
  title: string
  canDelete: boolean
}) {
  const router = useRouter()
  const dialog = useDialog()
  const [pending, startTransition] = useTransition()

  if (!canDelete) return null
  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => {
        void dialog
          .confirm(`确认删除“${title}”？此操作不可恢复。`, {
            title: '删除空分类',
            confirmText: '删除',
            danger: true,
          })
          .then(ok => {
            if (!ok) return
            startTransition(() => {
              void deleteCollection(id).then(result => {
                dialog.toast(result.message, {
                  tone: result.success ? 'success' : 'error',
                })
                if (result.success) router.push('/manage/collections')
              })
            })
          })
      }}
      className='ui-btn ui-btn-sm border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60'>
      {pending ? '删除中…' : '删除空分类'}
    </button>
  )
}

export function DeleteMaterialButton({
  id,
  title,
}: {
  id: string
  title: string
}) {
  const router = useRouter()
  const dialog = useDialog()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => {
        void dialog
          .confirm(`确认永久删除材料“${title}”？题目和学习记录也会一并删除。`, {
            title: '删除材料',
            confirmText: '永久删除',
            danger: true,
          })
          .then(ok => {
            if (!ok) return
            startTransition(() => {
              void deleteCollectionMaterial(id).then(result => {
                dialog.toast(result.message, {
                  tone: result.success ? 'success' : 'error',
                })
                if (result.success) router.refresh()
              })
            })
          })
      }}
      className='ui-btn ui-btn-sm border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60'>
      {pending ? '删除中…' : '删除材料'}
    </button>
  )
}

export function ClearEmptyPapersButton() {
  const router = useRouter()
  const dialog = useDialog()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type='button'
      disabled={pending}
      onClick={() => {
        void dialog
          .confirm('只会删除没有材料、也没有子分类的空试卷。', {
            title: '清理空试卷',
            confirmText: '开始清理',
            danger: true,
          })
          .then(ok => {
            if (!ok) return
            startTransition(() => {
              void clearEmptyCollections().then(result => {
                dialog.toast(result.message, {
                  tone: result.success ? 'success' : 'error',
                })
                if (result.success) router.refresh()
              })
            })
          })
      }}
      className='ui-btn ui-btn-sm border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-60'>
      {pending ? '清理中…' : '清理空试卷'}
    </button>
  )
}
