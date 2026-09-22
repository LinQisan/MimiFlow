'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import CustomSelect from '@/components/ui/CustomSelect'
import { useDialog } from '@/context/DialogContext'
import {
  deleteCollection,
  updateCollectionAttributes,
} from '@/modules/content/collections/actions'
import {
  createShadowingBook,
  createShadowingChapter,
} from '@/modules/listening/actions'
import type { CollectionNode } from '@/modules/listening/domain/listening-list'

type ActionState = { success: boolean; message: string }

const initialState: ActionState = { success: false, message: '' }

export default function ShadowingLibraryManager({
  collections,
}: {
  collections: CollectionNode[]
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const roots = sortNodes(collections.filter(item => item.collectionType === 'LIBRARY_ROOT'))
  const books = sortNodes(collections.filter(item => item.collectionType === 'BOOK'))
  const chapters = sortNodes(collections.filter(item => item.collectionType === 'CHAPTER'))
  const treeRows = roots.flatMap(root => [
    { node: root, depth: 0 },
    ...books
      .filter(book => book.parentId === root.id)
      .flatMap(book => [
        { node: book, depth: 1 },
        ...chapters
          .filter(chapter => chapter.parentId === book.id)
          .map(chapter => ({ node: chapter, depth: 2 })),
      ]),
  ])
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
    <div className='mb-6'>
      <button
        type='button'
        aria-expanded={isOpen}
        onClick={() => setIsOpen(value => !value)}
        className='flex w-full items-center justify-between gap-3 py-3 text-left'>
        <span className='text-sm font-bold text-slate-800'>教材与章节</span>
        <span className='text-xs text-slate-400'>
          {books.length} 本 · {chapters.length} 章
          <span className='ml-2'>{isOpen ? '收起' : '展开'}</span>
        </span>
      </button>

      {isOpen ? (
        <div className='py-4'>
          <div className='grid gap-4 lg:grid-cols-2'>
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

          <div className='mt-4 space-y-4 pl-4 sm:pl-8'>
            {treeRows.map(({ node, depth }) => (
              <NodeEditor key={node.id} node={node} depth={depth} />
            ))}
            {roots.length === 0 ? (
              <p className='py-4 text-sm text-slate-500'>暂无教材</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
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
    <form action={action}>
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

function NodeEditor({ node, depth }: { node: CollectionNode; depth: number }) {
  const router = useRouter()
  const dialog = useDialog()
  const [isOpen, setIsOpen] = useState(false)
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
    <div
      className={`py-3 ${
        depth === 0 ? '' : depth === 1 ? 'pl-5' : 'pl-10'
      }`}>
      <button
        type='button'
        aria-expanded={isOpen}
        onClick={() => setIsOpen(value => !value)}
        className='flex w-full items-center gap-2 text-left'>
        <span className='min-w-0 flex-1 truncate text-sm font-semibold text-slate-800'>{node.title}</span>
        <span className='text-xs text-slate-400'>
          {typeLabel} · {node._count.materials} 条
        </span>
        <span className='text-xs text-slate-400'>{isOpen ? '收起' : '编辑'}</span>
      </button>
      {isOpen ? (
      <form action={updateAction} className='mt-3 grid gap-2 pt-3 md:grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_6rem_auto]'>
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
      ) : null}
    </div>
  )
}

function sortNodes(nodes: CollectionNode[]) {
  return [...nodes].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'zh-CN'),
  )
}
