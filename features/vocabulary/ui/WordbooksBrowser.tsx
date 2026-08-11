'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createWordbook } from '@/modules/knowledge/wordbooks/actions'
import { useDialog } from '@/context/DialogContext'

type WordbookItem = {
  id: string
  title: string
  parentId: string | null
  count: number
}

type Props = {
  items: WordbookItem[]
}

type TreeNode = WordbookItem & { children: TreeNode[] }

const buildTree = (items: WordbookItem[]) => {
  const map = new Map<string, TreeNode>()
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  const roots: TreeNode[] = []

  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
      return
    }
    roots.push(node)
  })

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    nodes.forEach(node => sortNodes(node.children))
  }
  sortNodes(roots)
  return roots
}

export default function WordbooksBrowser({ items }: Props) {
  const dialog = useDialog()
  const [localItems, setLocalItems] = useState(items)
  const [search, setSearch] = useState('')

  const roots = useMemo(() => buildTree(localItems), [localItems])
  const normalizedSearch = search.trim().toLowerCase()
  const filteredRoots = roots.filter(node =>
    node.title.toLowerCase().includes(normalizedSearch),
  )

  const handleCreate = async () => {
    const name = await dialog.prompt('输入单词书名称', {
      title: '新建单词书',
      confirmText: '创建',
    })
    if (name == null) return

    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }

    const result = await createWordbook(trimmed, null)
    if (!result.success) {
      dialog.toast(result.message || '创建失败', { tone: 'error' })
      return
    }
    if (result.wordbook) {
      setLocalItems(previous => [
        ...previous,
        {
          id: result.wordbook!.id,
          title: result.wordbook!.title,
          parentId: result.wordbook!.parentId,
          count: 0,
        },
      ])
    }
    dialog.toast('已创建单词书', { tone: 'success' })
  }

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-4 md:p-5'>
      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'>
        <input
          type='search'
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder='搜索单词书'
          aria-label='搜索单词书'
          className='h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
        />
        <button
          type='button'
          onClick={() => void handleCreate()}
          className='ui-btn ui-btn-primary shrink-0'>
          新建单词书
        </button>
      </div>

      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
        {filteredRoots.map(node => (
          <Link
            key={node.id}
            href={`/vocabulary/wordbooks/${node.id}`}
            className='group rounded-xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50'>
            <div className='flex items-center justify-between gap-3'>
              <span className='min-w-0 truncate text-sm font-bold text-slate-900'>
                {node.title}
              </span>
              <span className='shrink-0 text-xs font-medium text-slate-400' aria-hidden='true'>
                →
              </span>
            </div>
            <p className='mt-1 text-xs text-slate-500'>
              {node.count} 词
              {node.children.length > 0 ? ` · ${node.children.length} 个目录` : ''}
            </p>
          </Link>
        ))}
        {filteredRoots.length === 0 ? (
          <p className='col-span-full py-10 text-center text-sm text-slate-500'>
            {normalizedSearch ? '没有匹配的单词书' : '还没有单词书'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
