'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import CustomSelect from '@/components/ui/CustomSelect'
import { useDialog } from '@/context/DialogContext'
import {
  deleteCollection,
  updateCollectionAttributes,
} from '@/features/collections/actions'
import {
  createShadowingBook,
  createShadowingChapter,
} from '@/features/listening/actions'
import type { CollectionNode } from '@/features/listening/domain/listening-list'

type ActionState = { success: boolean; message: string }

const initialState: ActionState = { success: false, message: '' }

export default function ShadowingLibraryManager({
  collections,
}: {
  collections: CollectionNode[]
}) {
  const router = useRouter()
  const roots = sortNodes(collections.filter(item => item.collectionType === 'LIBRARY_ROOT'))
  const books = sortNodes(collections.filter(item => item.collectionType === 'BOOK'))
  const chapters = sortNodes(collections.filter(item => item.collectionType === 'CHAPTER'))
  const [bookState, createBookAction, creatingBook] = useActionState(
    async (_previous: ActionState, formData: FormData) => {
      const result = await createShadowingBook(formData)
      if (result.success) router.refresh()
      return result
    },
    initialState,
  )
  const [chapterState, createChapterAction, creatingChapter] = useActionState(
    async (_previous: ActionState, formData: FormData) => {
      const result = await createShadowingChapter(formData)
      if (result.success) router.refresh()
      return result
    },
    initialState,
  )

  return (
    <details className='group mb-4 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm'>
      <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none'>
        <span className='text-sm font-bold text-slate-800'>教材与章节</span>
        <span className='text-xs text-slate-400'>
          {books.length} 本 · {chapters.length} 章
          <span className='ml-2 group-open:hidden'>展开</span>
          <span className='ml-2 hidden group-open:inline'>收起</span>
        </span>
      </summary>

      <div className='space-y-4 border-t border-slate-200 p-4'>
        <div className='grid gap-2 lg:grid-cols-2'>
          <CreateNodeForm
            action={createBookAction}
            pending={creatingBook}
            state={bookState}
            selectName='rootId'
            selectLabel='所属教材库'
            inputName='bookTitle'
            inputPlaceholder='教材名称'
            buttonLabel='新增教材'
            options={roots}
          />
          <CreateNodeForm
            action={createChapterAction}
            pending={creatingChapter}
            state={chapterState}
            selectName='bookId'
            selectLabel='所属教材'
            inputName='chapterTitle'
            inputPlaceholder='章节名称'
            buttonLabel='新增章节'
            options={books}
          />
        </div>

        <div className='space-y-3'>
          {roots.map(root => {
            const rootBooks = books.filter(book => book.parentId === root.id)
            return (
              <div key={root.id} className='rounded-xl border border-slate-200 bg-slate-50/70 p-3'>
                <NodeEditor node={root} />
                <div className='mt-2 space-y-2 border-l border-slate-200 pl-3'>
                  {rootBooks.map(book => (
                    <div key={book.id} className='rounded-xl border border-slate-200 bg-white p-3'>
                      <NodeEditor node={book} />
                      <div className='mt-2 space-y-2 border-l border-slate-200 pl-3'>
                        {chapters
                          .filter(chapter => chapter.parentId === book.id)
                          .map(chapter => (
                            <div key={chapter.id} className='rounded-lg bg-slate-50 px-3 py-2'>
                              <NodeEditor node={chapter} />
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {roots.length === 0 ? (
            <p className='rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500'>
              新增教材时会自动创建教材库。
            </p>
          ) : null}
        </div>
      </div>
    </details>
  )
}

function CreateNodeForm({
  action,
  pending,
  state,
  selectName,
  selectLabel,
  inputName,
  inputPlaceholder,
  buttonLabel,
  options,
}: {
  action: (formData: FormData) => void
  pending: boolean
  state: ActionState
  selectName: string
  selectLabel: string
  inputName: string
  inputPlaceholder: string
  buttonLabel: string
  options: CollectionNode[]
}) {
  return (
    <form action={action} className='rounded-xl border border-slate-200 p-3'>
      <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
        <CustomSelect name={selectName} className='h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm'>
          <option value=''>{selectLabel}</option>
          {options.map(item => (
            <option key={item.id} value={item.id}>{item.title}</option>
          ))}
        </CustomSelect>
        <input
          name={inputName}
          required
          placeholder={inputPlaceholder}
          className='h-9 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400'
        />
        <button type='submit' disabled={pending} className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-60'>
          {pending ? '保存中…' : buttonLabel}
        </button>
      </div>
      {state.message ? (
        <p aria-live='polite' className={`mt-2 text-xs ${state.success ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

function NodeEditor({ node }: { node: CollectionNode }) {
  const router = useRouter()
  const dialog = useDialog()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [state, updateAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => {
      const result = await updateCollectionAttributes(formData)
      if (result.success) router.refresh()
      return result
    },
    initialState,
  )
  const canDelete =
    node.collectionType !== 'LIBRARY_ROOT' &&
    node._count.materials === 0 &&
    node._count.children === 0
  const typeLabel =
    node.collectionType === 'LIBRARY_ROOT'
      ? '教材库'
      : node.collectionType === 'BOOK'
        ? '教材'
        : '章节'

  return (
    <details className='group/node'>
      <summary className='flex cursor-pointer list-none items-center gap-2 marker:content-none'>
        <span className='min-w-0 flex-1 truncate text-sm font-semibold text-slate-800'>{node.title}</span>
        <span className='text-xs text-slate-400'>
          {typeLabel} · {node._count.materials} 条
        </span>
        <span className='text-xs text-slate-400 group-open/node:hidden'>编辑</span>
        <span className='hidden text-xs text-slate-400 group-open/node:inline'>收起</span>
      </summary>
      <form action={updateAction} className='mt-3 grid gap-2 border-t border-slate-200 pt-3 md:grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_6rem_auto]'>
        <input type='hidden' name='collectionId' value={node.id} />
        <input type='hidden' name='parentId' value={node.parentId || ''} />
        <input type='hidden' name='description' value={node.description || ''} />
        <input type='hidden' name='level' value={node.level || ''} />
        <label className='text-xs font-semibold text-slate-500'>
          名称
          <input name='title' defaultValue={node.title} required className='mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-400' />
        </label>
        <label className='text-xs font-semibold text-slate-500'>
          语言
          <input name='language' defaultValue={node.language || ''} placeholder='ja' className='mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-400' />
        </label>
        <label className='text-xs font-semibold text-slate-500'>
          排序
          <input type='number' name='sortOrder' defaultValue={node.sortOrder} className='mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-400' />
        </label>
        <div className='flex items-end justify-end gap-2'>
          {canDelete ? (
            <button
              type='button'
              disabled={pending || isDeleting}
              onClick={() => {
                void dialog.confirm(`确认删除“${node.title}”？`, {
                  title: `删除${typeLabel}`,
                  confirmText: '删除',
                  danger: true,
                }).then(ok => {
                  if (!ok) return
                  startDeleteTransition(() => {
                    void deleteCollection(node.id).then(result => {
                      dialog.toast(result.message, { tone: result.success ? 'success' : 'error' })
                      if (result.success) router.refresh()
                    })
                  })
                })
              }}
              className='ui-btn ui-btn-sm border-rose-200 text-rose-700 disabled:opacity-60'>
              {isDeleting ? '删除中…' : '删除'}
            </button>
          ) : null}
          <button type='submit' disabled={pending || isDeleting} className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-60'>
            {pending ? '保存中…' : '保存'}
          </button>
        </div>
        {state.message ? (
          <p aria-live='polite' className={`text-xs md:col-span-4 ${state.success ? 'text-emerald-700' : 'text-rose-700'}`}>
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  )
}

function sortNodes(nodes: CollectionNode[]) {
  return [...nodes].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'zh-CN'),
  )
}
