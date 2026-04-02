'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/context/I18nContext'

type MenuItem = {
  href: string
  label: string
  shortLabel: string
}

type MenuGroup = {
  id: string
  label: string
  children: MenuItem[]
}

type RouteMenuProps = {
  collapsed?: boolean
  className?: string
  onNavigate?: () => void
  levels?: { id: string; title: string }[]
}

export default function RouteMenu({
  collapsed = false,
  className = '',
  onNavigate,
  levels = [],
}: RouteMenuProps) {
  const { t } = useI18n()
  const pathname = usePathname()
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const groups = useMemo<MenuGroup[]>(
    () => [
      {
        id: 'learn',
        label: t('nav.learn') || '学习',
        children: [
          { href: '/', label: t('nav.home'), shortLabel: '首' },
          { href: '/game#today', label: '今日任务', shortLabel: '今' },
          { href: '/game', label: t('nav.game') || '游戏', shortLabel: '游' },
          { href: '/game/diaries', label: t('nav.diaries') || '日记', shortLabel: '记' },
          { href: '/search', label: '搜索', shortLabel: '搜' },
          {
            href: '/sentences',
            label: t('nav.sentences'),
            shortLabel: '句',
          },
          {
            href: '/vocabulary',
            label: t('nav.vocabulary'),
            shortLabel: '词',
          },
          { href: '/articles', label: t('nav.articles'), shortLabel: '读' },
          { href: '/quizzes', label: t('nav.quizzes'), shortLabel: '题' },
          { href: '/review', label: t('nav.review') || '复习', shortLabel: '复' },
          { href: '/retry', label: '错题回流', shortLabel: '错' },
        ],
      },
      {
        id: 'listening',
        label: '听力语料',
        children: [
          ...levels.map((level, idx) => ({
            href: `/level/${level.id}`,
            label: level.title,
            shortLabel: level.title.charAt(0) || String(idx + 1),
          })),
        ],
      },
      {
        id: 'manage',
        label: '管理',
        children: [
          { href: '/manage', label: '管理首页', shortLabel: '首' },
          { href: '/manage/level', label: '分类管理', shortLabel: '类' },
          { href: '/manage/upload', label: '语料录入', shortLabel: '录' },
          { href: '/manage/import/anki', label: 'Anki导入', shortLabel: '导' },
          { href: '/manage/audio', label: '录音管理', shortLabel: '音' },
          { href: '/manage/vocabulary', label: '词库管理', shortLabel: '词' },
          { href: '/manage/fsrs', label: 'FSRS面板', shortLabel: '算' },
        ],
      },
    ],
    [levels, t],
  )

  const flatItems = useMemo(() => groups.flatMap(group => group.children), [groups])

  const routeMatches = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const activeHref = useMemo(() => {
    const matches = flatItems.filter(item => routeMatches(item.href))
    if (matches.length === 0) return ''
    return matches.sort((a, b) => b.href.length - a.href.length)[0].href
  }, [flatItems, pathname])

  const isCurrentRoute = (href: string) => activeHref === href

  const currentGroupId = useMemo(() => {
    const group = groups.find(g => g.children.some(item => isCurrentRoute(item.href)))
    return group?.id ?? groups[0]?.id ?? 'learn'
  }, [groups, activeHref])

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    learn: true,
    listening: true,
    manage: true,
  })

  useEffect(() => {
    if (collapsed) return
    setOpenGroups(prev => ({
      ...prev,
      [currentGroupId]: true,
    }))
  }, [collapsed, currentGroupId])

  const visibleItems = useMemo(() => {
    if (collapsed) return flatItems
    return groups.flatMap(group => (openGroups[group.id] ? group.children : []))
  }, [collapsed, flatItems, groups, openGroups])

  const handleNavKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (visibleItems.length === 0) return

    const activeEl = document.activeElement
    const currentIndex = itemRefs.current.findIndex(el => el === activeEl)

    const moveFocus = (nextIndex: number) => {
      const index = (nextIndex + visibleItems.length) % visibleItems.length
      itemRefs.current[index]?.focus()
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(currentIndex >= 0 ? currentIndex + 1 : 0)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(currentIndex >= 0 ? currentIndex - 1 : visibleItems.length - 1)
    }

    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
    }

    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(visibleItems.length - 1)
    }
  }

  const renderItem = (item: MenuItem, idx: number) => {
    const active = isCurrentRoute(item.href)
    return (
      <Link
        key={item.href}
        ref={el => {
          itemRefs.current[idx] = el
        }}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`group block rounded-xl font-bold transition-all ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${collapsed ? 'py-2.5 px-0 text-center text-sm' : 'px-4 py-2.5 text-left'}`}>
        {collapsed ? (
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-indigo-200/70 text-indigo-800'
                : 'bg-gray-200/60 text-gray-600 group-hover:bg-gray-300/80'
            }`}>
            {item.shortLabel}
          </span>
        ) : (
          <span>{item.label}</span>
        )}
      </Link>
    )
  }

  let visibleIndex = -1

  return (
    <nav
      aria-label={t('nav.menu')}
      onKeyDown={handleNavKeyDown}
      className={`space-y-4 ${className}`}>
      {collapsed ? (
        <div className='space-y-1'>
          {flatItems.map(item => {
            visibleIndex += 1
            return renderItem(item, visibleIndex)
          })}
        </div>
      ) : (
        groups.map(group => (
          <section key={group.id}>
            <button
              type='button'
              onClick={() =>
                setOpenGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))
              }
              aria-expanded={openGroups[group.id]}
              aria-controls={`menu-group-${group.id}`}
              className='w-full px-3 py-1 text-left text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between'>
              <span>{group.label}</span>
              <span>{openGroups[group.id] ? '−' : '+'}</span>
            </button>

            {openGroups[group.id] && (
              <div id={`menu-group-${group.id}`} className='space-y-1 mt-2'>
                {group.children.map(item => {
                  visibleIndex += 1
                  return renderItem(item, visibleIndex)
                })}
              </div>
            )}
          </section>
        ))
      )}
    </nav>
  )
}
