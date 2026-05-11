'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  createWordbook,
  renameWordbook,
  deleteWordbook,
} from '@/app/actions/content'
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
  return { roots, map }
}

export default function WordbooksBrowser({ items }: Props) {
  const dialog = useDialog()
  const [localItems, setLocalItems] = useState(items)
  const [activeRootId, setActiveRootId] = useState<string | null>(
    items.find(item => !item.parentId)?.id || null,
  )
  const [search, setSearch] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])

  const { roots, map } = useMemo(() => buildTree(localItems), [localItems])
  const activeRoot = activeRootId ? map.get(activeRootId) || null : null
  const filteredRoots = roots.filter(node =>
    node.title.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const recentItems = useMemo(
    () =>
      recentIds
        .map(id => map.get(id))
        .filter(Boolean)
        .slice(0, 6) as TreeNode[],
    [map, recentIds],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('wordbooks:recent')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentIds(parsed.filter(item => typeof item === 'string'))
      }
    } catch {
      setRecentIds([])
    }
  }, [])

  const pushRecent = (id: string) => {
    const next = [id, ...recentIds.filter(item => item !== id)].slice(0, 8)
    setRecentIds(next)
    try {
      window.localStorage.setItem('wordbooks:recent', JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const coverStyle = (title: string) => {
    let hash = 0
    for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 360
    const h1 = hash
    const h2 = (hash + 45) % 360
    return {
      background: `linear-gradient(145deg, hsl(${h1} 45% 18%), hsl(${h2} 55% 30%))`,
    }
  }

  const handleCreateRoot = async () => {
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
    const res = await createWordbook(trimmed, null)
    if (!res.success) {
      dialog.toast(res.message || '创建失败', { tone: 'error' })
      return
    }
    if (res.wordbook) {
      setLocalItems(prev => [
        ...prev,
        { id: res.wordbook.id, title: res.wordbook.title, parentId: res.wordbook.parentId, count: 0 },
      ])
      setActiveRootId(res.wordbook.id)
    }
    dialog.toast('已创建单词书', { tone: 'success' })
  }

  const handleCreateChild = async () => {
    if (!activeRootId || !activeRoot) {
      dialog.toast('请先在书架中选一本书', { tone: 'error' })
      return
    }
    const name = await dialog.prompt('输入子单词书名称', {
      title: `为「${activeRoot.title}」新建目录`,
      confirmText: '创建',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await createWordbook(trimmed, activeRootId)
    if (!res.success) {
      dialog.toast(res.message || '创建失败', { tone: 'error' })
      return
    }
    if (res.wordbook) {
      setLocalItems(prev => [
        ...prev,
        { id: res.wordbook.id, title: res.wordbook.title, parentId: res.wordbook.parentId, count: 0 },
      ])
    }
    dialog.toast('已创建子单词书', { tone: 'success' })
  }

  const handleRename = async () => {
    if (!activeRootId || !activeRoot) return
    const name = await dialog.prompt('输入新名称', {
      title: '重命名单词书',
      defaultValue: activeRoot.title,
      confirmText: '保存',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await renameWordbook(activeRootId, trimmed)
    if (!res.success) {
      dialog.toast(res.message || '重命名失败', { tone: 'error' })
      return
    }
    setLocalItems(prev =>
      prev.map(item =>
        item.id === activeRootId ? { ...item, title: trimmed } : item,
      ),
    )
    dialog.toast('名称已更新', { tone: 'success' })
  }

  const handleDelete = async () => {
    if (!activeRootId || !activeRoot) return
    const confirmed = await dialog.confirm(
      `确认删除「${activeRoot.title}」吗？已加入该单词书的关联会被移除。`,
      {
        title: '删除单词书',
        confirmText: '删除',
        danger: true,
      },
    )
    if (!confirmed) return
    const res = await deleteWordbook(activeRootId)
    if (!res.success) {
      dialog.toast(res.message || '删除失败', { tone: 'error' })
      return
    }
    setLocalItems(prev => prev.filter(item => item.id !== activeRootId))
    const nextRoot = roots.find(item => item.id !== activeRootId)
    setActiveRootId(nextRoot?.id || null)
    dialog.toast('单词书已删除', { tone: 'success' })
  }

  return (
    <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-5'>
      <div className='mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4'>
        <button type='button' onClick={() => void handleCreateRoot()} className='ui-btn ui-btn-primary'>
          新建单词书
        </button>
        <button type='button' onClick={() => void handleCreateChild()} className='ui-btn' disabled={!activeRootId}>
          新建目录
        </button>
        <button type='button' onClick={() => void handleRename()} className='ui-btn' disabled={!activeRootId}>
          重命名
        </button>
        <button
          type='button'
          onClick={() => void handleDelete()}
          className='ui-btn ui-btn-danger'
          disabled={!activeRootId}>
          删除
        </button>
        <input
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder='搜索单词书'
          className='ml-auto h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
        />
      </div>

      {recentItems.length > 0 ? (
        <div className='mb-4 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
            最近使用
          </p>
          <div className='mt-2 flex flex-wrap gap-2'>
            {recentItems.map(item => (
              <Link
                key={`recent-${item.id}`}
                href={`/wordbooks/${item.id}`}
                onClick={() => pushRecent(item.id)}
                className='inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50'>
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {filteredRoots.map(node => (
          <div key={node.id} className='group'>
            <Link
              href={`/wordbooks/${node.id}`}
              onClick={() => {
                setActiveRootId(node.id)
                pushRecent(node.id)
              }}
              className='mb-2 block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'>
              <div className='aspect-[3/4] w-full p-4 text-left text-white' style={coverStyle(node.title)}>
                <p className='line-clamp-3 text-lg font-black leading-tight'>
                  {node.title}
                </p>
                <p className='mt-3 text-xs font-semibold text-white/80'>
                  目录 {node.children.length} · 词条 {node.count}
                </p>
              </div>
            </Link>
            <Link
              href={`/wordbooks/${node.id}`}
              onClick={() => pushRecent(node.id)}
              className='block truncate text-sm font-semibold text-slate-800 hover:text-slate-950'>
              {node.title}
            </Link>
            <p className='mt-1 text-xs text-slate-500'>
              {node.children.length > 0 ? `${node.children.length} 个目录` : '无目录'}
            </p>
          </div>
        ))}
        {filteredRoots.length === 0 ? (
          <p className='col-span-full py-10 text-center text-sm text-slate-500'>
            没有匹配的单词书
          </p>
        ) : null}
      </div>
    </section>
  )
}
