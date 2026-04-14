'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type CollectionBrowserOption = {
  value: string
  label: string
  searchText?: string
  parentId?: string | null
  depth?: number
  order?: number
}

type CollectionBrowserNode = CollectionBrowserOption & {
  children: string[]
  rootId: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: CollectionBrowserOption[]
  placeholder: string
  recentKey?: string
}

const MAX_RECENTS = 8

const normalizeText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const compareNodes = (a: CollectionBrowserNode, b: CollectionBrowserNode) =>
  (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, 'zh-CN')

function useRecentValues(recentKey?: string) {
  const [recentValues, setRecentValues] = useState<string[]>([])

  useEffect(() => {
    if (!recentKey || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(recentKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentValues(parsed.filter(item => typeof item === 'string'))
      }
    } catch {
      setRecentValues([])
    }
  }, [recentKey])

  const pushRecentValue = (nextValue: string) => {
    if (!recentKey) return
    setRecentValues(prev => {
      const next = [nextValue, ...prev.filter(item => item !== nextValue)].slice(
        0,
        MAX_RECENTS,
      )
      try {
        window.localStorage.setItem(recentKey, JSON.stringify(next))
      } catch {
        // ignore storage failures
      }
      return next
    })
  }

  return { recentValues, pushRecentValue }
}

function buildCollectionBrowserTree(options: CollectionBrowserOption[]) {
  const map = new Map<string, CollectionBrowserNode>()
  options.forEach(option => {
    map.set(option.value, {
      ...option,
      children: [],
      rootId: option.value,
    })
  })

  map.forEach(node => {
    const parentId = node.parentId
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node.value)
    }
  })

  const roots: string[] = []
  map.forEach(node => {
    const parentId = node.parentId
    if (parentId && map.has(parentId)) return
    roots.push(node.value)
  })

  const memoRootId = new Map<string, string>()
  const getRootId = (nodeId: string): string => {
    const cached = memoRootId.get(nodeId)
    if (cached) return cached

    const node = map.get(nodeId)
    if (!node) return nodeId
    if (!node.parentId || !map.has(node.parentId)) {
      memoRootId.set(nodeId, nodeId)
      return nodeId
    }

    const rootId = getRootId(node.parentId)
    memoRootId.set(nodeId, rootId)
    return rootId
  }

  map.forEach(node => {
    node.rootId = getRootId(node.value)
  })

  const sortChildren = (ids: string[]) =>
    ids.sort((a, b) => compareNodes(map.get(a)!, map.get(b)!))

  sortChildren(roots)
  map.forEach(node => sortChildren(node.children))

  return {
    map,
    roots,
  }
}

export default function CollectionBrowserSelect({
  value,
  onChange,
  options,
  placeholder,
  recentKey,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { recentValues, pushRecentValue } = useRecentValues(recentKey)

  const { map, roots } = useMemo(
    () => buildCollectionBrowserTree(options),
    [options],
  )

  const selectedNode = value ? map.get(value) : undefined
  const selectedLabel = selectedNode
    ? selectedNode.searchText || selectedNode.label
    : placeholder

  const getAncestors = (nodeId: string) => {
    const ancestors: CollectionBrowserNode[] = []
    let cursor = map.get(nodeId)
    while (cursor?.parentId && map.has(cursor.parentId)) {
      const parent = map.get(cursor.parentId)!
      ancestors.unshift(parent)
      cursor = parent
    }
    return ancestors
  }

  const openBranch = (nodeId: string) => {
    setActiveNodeId(nodeId)
    setSearch('')
  }

  const selectNode = (nodeId: string) => {
    onChange(nodeId)
    pushRecentValue(nodeId)
    setIsOpen(false)
    setSearch('')
    const node = map.get(nodeId)
    setActiveNodeId(node?.parentId && map.has(node.parentId) ? node.parentId : null)
  }

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!value || !map.has(value)) {
      setActiveNodeId(null)
      return
    }
    const node = map.get(value)!
    setActiveNodeId(node.parentId && map.has(node.parentId) ? node.parentId : null)
  }, [isOpen, map, value])

  const currentNodes = useMemo(() => {
    if (search.trim()) return []
    if (!activeNodeId) return roots.map(id => map.get(id)!).filter(Boolean)
    return map.get(activeNodeId)?.children.map(id => map.get(id)!).filter(Boolean) ?? []
  }, [activeNodeId, map, roots, search])

  const activeNode = activeNodeId ? map.get(activeNodeId) : null
  const activeAncestors = activeNodeId ? getAncestors(activeNodeId) : []

  const recentNodes = useMemo(
    () => recentValues.map(id => map.get(id)).filter(Boolean) as CollectionBrowserNode[],
    [map, recentValues],
  )

  const searchResults = useMemo(() => {
    const query = normalizeText(search)
    if (!query) return []

    const matched = [...map.values()].filter(node => {
      const pathText = normalizeText(node.searchText || node.label)
      const labelText = normalizeText(node.label)
      return pathText.includes(query) || labelText.includes(query)
    })

    const grouped = new Map<string, CollectionBrowserNode[]>()
    matched.forEach(node => {
      const root = map.get(node.rootId) || node
      const groupKey = root.value
      if (!grouped.has(groupKey)) grouped.set(groupKey, [])
      grouped.get(groupKey)!.push(node)
    })

    return Array.from(grouped.entries()).map(([rootId, items]) => ({
      root: map.get(rootId)!,
      items: items.sort(compareNodes),
    }))
  }, [map, search])

  const renderNodeRow = (node: CollectionBrowserNode, mode: 'browse' | 'search' | 'recent') => {
    const hasChildren = node.children.length > 0
    const isSelected = node.value === value
    const indent = mode === 'browse' ? (node.depth ?? 0) : 0
    const secondaryText = mode === 'search' ? node.searchText || '' : ''

    return (
      <button
        key={node.value}
        type='button'
        onClick={() => {
          if (search.trim()) {
            if (hasChildren) {
              openBranch(node.value)
            } else {
              selectNode(node.value)
            }
            return
          }

          if (hasChildren) {
            openBranch(node.value)
            return
          }

          selectNode(node.value)
        }}
        className={`group flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700'
            : 'hover:bg-gray-50 hover:text-blue-700'
        }`}
        style={{ paddingLeft: `${12 + indent * 14}px` }}>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-bold'>{node.label}</span>
          {secondaryText ? (
            <span className='mt-1 block truncate text-[11px] font-medium text-gray-400'>
              {secondaryText}
            </span>
          ) : null}
        </span>
        <span className='flex shrink-0 items-center gap-2'>
          {hasChildren ? (
            <span className='rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-gray-500'>
              {node.children.length}
            </span>
          ) : null}
          <span className='text-[11px] font-black uppercase tracking-wide text-gray-300 group-hover:text-blue-500'>
            {hasChildren ? '进入' : '选择'}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className='relative w-full' ref={rootRef}>
      <button
        type='button'
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex w-full items-center justify-between border px-4 py-3 text-left text-sm font-bold transition-colors ${
          isOpen
            ? 'border-blue-300 bg-white ring-2 ring-blue-200'
            : 'border-gray-200 bg-gray-50 hover:bg-white'
        }`}>
        <span className={value ? 'min-w-0 flex-1 truncate pr-3 text-gray-800' : 'text-gray-400'}>
          {selectedLabel}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </button>

      {isOpen ? (
        <div className='absolute z-[80] mt-2 w-full overflow-hidden border border-gray-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]'>
          <div className='border-b border-gray-100 p-3'>
            <div className='relative'>
              <svg
                className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
                />
              </svg>
              <input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder='搜索集合路径或名称'
                className='w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100'
              />
              {search ? (
                <button
                  type='button'
                  onClick={() => setSearch('')}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'>
                  <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          <div className='grid max-h-[32rem] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]'>
            <aside className='border-b border-gray-100 bg-gray-50/70 md:border-b-0 md:border-r'>
              <div className='p-3'>
                <div className='mb-2 flex items-center justify-between'>
                  <p className='text-[11px] font-black uppercase tracking-[0.2em] text-gray-400'>
                    最近使用
                  </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  {recentNodes.length ? (
                    recentNodes.map(node => (
                      <button
                        key={node.value}
                        type='button'
                        onClick={() => {
                          if (node.children.length > 0) {
                            openBranch(node.value)
                          } else {
                            selectNode(node.value)
                          }
                        }}
                        className={`max-w-full rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                          value === node.value
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:text-blue-700'
                        }`}>
                        <span className='block max-w-[11rem] truncate'>{node.label}</span>
                      </button>
                    ))
                  ) : (
                    <p className='text-xs text-gray-400'>还没有常用集合</p>
                  )}
                </div>
              </div>

              <div className='border-t border-gray-200/70 px-3 pb-3 pt-2'>
                <p className='mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400'>
                  一级分类
                </p>
                <div className='max-h-[18rem] overflow-y-auto pr-1'>
                  {roots.map(id => {
                    const node = map.get(id)
                    if (!node) return null
                    const isActive = activeNodeId === node.value
                    const isRootOfSelection =
                      selectedNode && selectedNode.rootId === node.value

                    return (
                      <button
                        key={node.value}
                        type='button'
                        onClick={() => openBranch(node.value)}
                        className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${
                          isActive || isRootOfSelection
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-white hover:text-blue-700'
                        }`}>
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-sm font-black'>{node.label}</span>
                          {node.searchText && node.searchText !== node.label ? (
                            <span className='mt-0.5 block truncate text-[11px] font-medium text-gray-400'>
                              {node.searchText}
                            </span>
                          ) : null}
                        </span>
                        {node.children.length ? (
                          <span className='ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-gray-500'>
                            {node.children.length}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </aside>

            <section className='min-h-[18rem] bg-white'>
              {search.trim() ? (
                <div className='max-h-[32rem] overflow-y-auto'>
                  {searchResults.length ? (
                    searchResults.map(group => (
                      <div key={group.root.value} className='border-b border-gray-100 last:border-b-0'>
                        <div className='sticky top-0 z-[2] border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400'>
                          {group.root.label}
                        </div>
                        {group.items.map(node => {
                          const hasChildren = node.children.length > 0
                          return (
                            <button
                              key={node.value}
                              type='button'
                              onClick={() => {
                                if (hasChildren) {
                                  openBranch(node.value)
                                } else {
                                  selectNode(node.value)
                                }
                              }}
                              className='flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 hover:text-blue-700'>
                              <span className='min-w-0 flex-1'>
                                <span className='block truncate text-sm font-bold text-gray-800'>
                                  {node.label}
                                </span>
                                <span className='mt-1 block truncate text-[11px] font-medium text-gray-400'>
                                  {node.searchText || node.label}
                                </span>
                              </span>
                              <span className='shrink-0 text-[11px] font-black tracking-wide text-gray-300'>
                                {hasChildren ? '进入' : '选择'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ))
                  ) : (
                    <div className='flex h-full items-center justify-center px-4 py-12 text-sm text-gray-400'>
                      无匹配结果
                    </div>
                  )}
                </div>
              ) : (
                <div className='max-h-[32rem] overflow-y-auto'>
                  <div className='sticky top-0 z-[2] border-b border-gray-100 bg-white px-4 py-3'>
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                      <button
                        type='button'
                        onClick={() => setActiveNodeId(null)}
                        className='rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 hover:border-blue-200 hover:text-blue-700'>
                        根目录
                      </button>
                      {activeAncestors.map(node => (
                        <button
                          key={node.value}
                          type='button'
                          onClick={() => setActiveNodeId(node.value)}
                          className='rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 hover:border-blue-200 hover:text-blue-700'>
                          {node.label}
                        </button>
                      ))}
                      {activeNode ? (
                        <span className='rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700'>
                          {activeNode.label}
                        </span>
                      ) : null}
                    </div>
                    <p className='mt-2 text-[11px] font-medium text-gray-400'>
                      {activeNode
                        ? '点击有子节点的项进入下一层，点击叶子节点即可选择。'
                        : '先从左侧选择一级分类。'}
                    </p>
                  </div>

                  {currentNodes.length ? (
                    <div>
                      {currentNodes.map(node =>
                        renderNodeRow(node, 'browse'),
                      )}
                    </div>
                  ) : (
                    <div className='flex h-[18rem] items-center justify-center px-4 text-sm text-gray-400'>
                      {activeNode ? '这个分类下面还没有内容' : '请选择左侧的一级分类'}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

    </div>
  )
}
