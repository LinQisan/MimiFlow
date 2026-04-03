'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/context/I18nContext'

type MenuItem = {
  href: string
  label: string
  shortLabel: string
  icon?: MenuIconKey
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

type MenuIconKey =
  | 'home'
  | 'today'
  | 'articles'
  | 'quizzes'
  | 'sentences'
  | 'vocabulary'
  | 'review'
  | 'retry'
  | 'search'
  | 'game'
  | 'diaries'
  | 'manage'
  | 'level'
  | 'upload'
  | 'audio'
  | 'manageVocab'
  | 'anki'
  | 'fsrs'

function MenuIcon({ icon, active }: { icon?: MenuIconKey; active: boolean }) {
  const color = active ? 'currentColor' : 'currentColor'
  const base = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'home':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M3.5 8.5L10 3.5L16.5 8.5V16H3.5V8.5Z' {...base} />
          <path d='M8 16V11H12V16' {...base} />
        </svg>
      )
    case 'today':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <rect x='3.5' y='4.5' width='13' height='12' rx='2' {...base} />
          <path d='M6.5 2.8V6M13.5 2.8V6M3.5 8H16.5' {...base} />
        </svg>
      )
    case 'articles':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <rect x='4' y='3.5' width='12' height='13' rx='2' {...base} />
          <path d='M7 7H13M7 10H13M7 13H11' {...base} />
        </svg>
      )
    case 'quizzes':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <circle cx='10' cy='10' r='6.5' {...base} />
          <path d='M8.2 8.2C8.2 7.2 9 6.5 10 6.5C11 6.5 11.8 7.2 11.8 8.2C11.8 9.6 10 9.7 10 11.1M10 13.3H10.01' {...base} />
        </svg>
      )
    case 'sentences':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M4 5.5H16M4 9.5H16M4 13.5H11' {...base} />
        </svg>
      )
    case 'vocabulary':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M4 4.5H9.5V15.5H4C3.7 15.5 3.5 15.3 3.5 15V5C3.5 4.7 3.7 4.5 4 4.5Z' {...base} />
          <path d='M16 4.5H10.5V15.5H16C16.3 15.5 16.5 15.3 16.5 15V5C16.5 4.7 16.3 4.5 16 4.5Z' {...base} />
        </svg>
      )
    case 'review':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M10 3.5L12 7.5L16.5 8.2L13.2 11.4L14 16L10 13.8L6 16L6.8 11.4L3.5 8.2L8 7.5L10 3.5Z' {...base} />
        </svg>
      )
    case 'retry':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M16 7V4H13M4 13V16H7' {...base} />
          <path d='M15.5 9A5.5 5.5 0 0 0 6 5.8L4.5 7M4.5 11A5.5 5.5 0 0 0 14 14.2L15.5 13' {...base} />
        </svg>
      )
    case 'search':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <circle cx='9' cy='9' r='4.5' {...base} />
          <path d='M12.5 12.5L16 16' {...base} />
        </svg>
      )
    case 'game':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <rect x='3.5' y='7' width='13' height='7.5' rx='2' {...base} />
          <path d='M7 10.7H9.3M8.15 9.6V11.8M12.8 10.2H12.81M14.2 11.4H14.21' {...base} />
        </svg>
      )
    case 'diaries':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <rect x='4' y='3.5' width='12' height='13' rx='2' {...base} />
          <path d='M7 7H13M7 10H13M7 13H12' {...base} />
        </svg>
      )
    case 'manage':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M10 6V10L12.8 11.6' {...base} />
          <circle cx='10' cy='10' r='6' {...base} />
        </svg>
      )
    case 'level':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M4 15.5H16M4.5 15.5V8L8 5.5L10.5 7.5L13.5 5L16 7V15.5' {...base} />
        </svg>
      )
    case 'upload':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M10 13.5V5.5M7.2 8.3L10 5.5L12.8 8.3M4.5 14.5V16H15.5V14.5' {...base} />
        </svg>
      )
    case 'audio':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M4.5 8.5V11.5M7.5 7V13M10.5 8.8V11.2M13.5 6V14M16.5 8V12' {...base} />
        </svg>
      )
    case 'manageVocab':
      return <MenuIcon icon='vocabulary' active={active} />
    case 'anki':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <rect x='4' y='4' width='12' height='12' rx='2' {...base} />
          <path d='M7 10H13M10 7V13' {...base} />
        </svg>
      )
    case 'fsrs':
      return (
        <svg className='h-4 w-4' viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='M4 14L7.2 10.8L9.5 13.1L14.8 7.8' {...base} />
          <path d='M13 7.8H14.8V9.6' {...base} />
        </svg>
      )
    default:
      return null
  }
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
  const getText = (key: string, fallback: string) => {
    const value = t(key)
    return value === key ? fallback : value
  }

  const groups = useMemo<MenuGroup[]>(
    () => [
      {
        id: 'study',
        label: getText('nav.sectionStudy', getText('nav.learn', '学习')),
        children: [
          { href: '/today', label: getText('nav.today', '今日任务'), shortLabel: '今', icon: 'today' },
          { href: '/articles', label: getText('nav.articles', '阅读'), shortLabel: '读', icon: 'articles' },
          { href: '/quizzes', label: getText('nav.quizzes', '刷题'), shortLabel: '题', icon: 'quizzes' },
          { href: '/sentences', label: getText('nav.sentences', '句库'), shortLabel: '句', icon: 'sentences' },
          { href: '/vocabulary', label: getText('nav.vocabulary', '生词'), shortLabel: '词', icon: 'vocabulary' },
          { href: '/review', label: getText('nav.review', '复习'), shortLabel: '复', icon: 'review' },
          { href: '/retry', label: getText('nav.retry', '错题'), shortLabel: '错', icon: 'retry' },
          { href: '/search', label: getText('nav.search', '搜索'), shortLabel: '搜', icon: 'search' },
          { href: '/game', label: getText('nav.game', '游戏'), shortLabel: '游', icon: 'game' },
          {
            href: '/game/diaries',
            label: getText('nav.diaries', '日记'),
            shortLabel: '记',
            icon: 'diaries',
          },
          { href: '/', label: getText('nav.home', '主页'), shortLabel: '主', icon: 'home' },
        ],
      },
      {
        id: 'corpus',
        label: getText('nav.sectionCorpus', '语料'),
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
        label: getText('nav.sectionManage', getText('nav.admin', '管理')),
        children: [
          { href: '/manage', label: getText('nav.manageHome', '管理首页'), shortLabel: '管', icon: 'manage' },
          { href: '/manage/level', label: getText('nav.manageLevel', '分类管理'), shortLabel: '分', icon: 'level' },
          { href: '/manage/upload', label: getText('nav.manageUpload', '语料录入'), shortLabel: '录', icon: 'upload' },
          { href: '/manage/audio', label: getText('nav.manageAudio', '录音管理'), shortLabel: '音', icon: 'audio' },
          { href: '/manage/vocabulary', label: getText('nav.manageVocab', '词库管理'), shortLabel: '词', icon: 'manageVocab' },
          { href: '/manage/import/anki', label: getText('nav.manageAnki', 'Anki导入'), shortLabel: '导', icon: 'anki' },
          { href: '/manage/fsrs', label: getText('nav.manageFsrs', 'FSRS面板'), shortLabel: '算', icon: 'fsrs' },
        ],
      },
    ],
    [levels, t],
  )

  const flatItems = useMemo(() => groups.flatMap(group => group.children), [groups])

  const collapsedItems = useMemo(() => {
    const primary = groups
      .filter(group => group.id !== 'corpus')
      .flatMap(group => group.children)
    const corpusGroup = groups.find(group => group.id === 'corpus')
    const activeCorpusItem = corpusGroup?.children.find(item =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    if (
      activeCorpusItem &&
      !primary.some(item => item.href === activeCorpusItem.href)
    ) {
      return [...primary, activeCorpusItem]
    }
    return primary
  }, [groups, pathname])

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
    return group?.id ?? groups[0]?.id ?? 'study'
  }, [groups, activeHref])

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    groups.reduce(
      (acc, group) => {
        acc[group.id] = group.id === 'study'
        return acc
      },
      {} as Record<string, boolean>,
    ),
  )

  useEffect(() => {
    setOpenGroups(prev =>
      groups.reduce(
        (acc, group) => {
          acc[group.id] = prev[group.id] ?? group.id === 'study'
          return acc
        },
        {} as Record<string, boolean>,
      ),
    )
  }, [groups])

  useEffect(() => {
    if (collapsed) return
    setOpenGroups(prev => ({
      ...prev,
      [currentGroupId]: true,
    }))
  }, [collapsed, currentGroupId])

  const visibleItems = useMemo(() => {
    if (collapsed) return collapsedItems
    return groups.flatMap(group => (openGroups[group.id] ? group.children : []))
  }, [collapsed, collapsedItems, groups, openGroups])

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
        className={`group block rounded-xl font-bold transition-colors ${
          active
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
            : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
        } ${collapsed ? 'py-2 px-0 text-center text-sm' : 'px-3 py-2 text-left text-sm'}`}>
        {collapsed ? (
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-indigo-200/70 text-indigo-800 dark:bg-indigo-400/30 dark:text-indigo-100'
                : 'bg-gray-200/60 text-gray-600 dark:bg-slate-700 dark:text-slate-300 group-hover:bg-gray-300/80 dark:group-hover:bg-slate-600'
            }`}>
            {item.icon ? (
              <MenuIcon icon={item.icon} active={active} />
            ) : (
              item.shortLabel
            )}
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
      className={`space-y-3 ${className}`}>
      {collapsed ? (
        <div className='space-y-1'>
          {collapsedItems.map(item => {
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
              className='w-full px-3 py-1 text-left text-[11px] font-bold text-gray-400 dark:text-slate-400 tracking-wide flex items-center justify-between border-b border-gray-100 dark:border-slate-800'>
              <span>{group.label}</span>
              <svg
                className={`h-4 w-4 text-gray-400 dark:text-slate-500 transition-transform ${
                  openGroups[group.id] ? 'rotate-180' : ''
                }`}
                viewBox='0 0 20 20'
                fill='none'
                aria-hidden='true'>
                <path
                  d='M5 7.5L10 12.5L15 7.5'
                  stroke='currentColor'
                  strokeWidth='1.8'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </button>

            {openGroups[group.id] && (
              <div id={`menu-group-${group.id}`} className='space-y-1 mt-1.5'>
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
