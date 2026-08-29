'use client'

/* eslint-disable @next/next/no-html-link-for-pages -- global navigation intentionally performs document requests */

import { usePathname } from 'next/navigation'
import ResourceMenu from './ResourceMenu'
import UserSwitcher from './UserSwitcher'
import type { UserSummary } from '@/modules/users/server/current-user'

const primaryItems = [
  { href: '/listening', label: '听力' },
  { href: '/reading', label: '阅读' },
  { href: '/practice', label: '练习' },
  { href: '/review', label: '复习' },
  { href: '/vocabulary', label: '词汇' },
]

const isFocusRoute = (pathname: string) =>
  /^\/listening\/[^/]+$/.test(pathname) ||
  /^\/reading\/(articles|ebooks)\/[^/]+$/.test(pathname) ||
  /^\/subtitles\/[^/]+$/.test(pathname) ||
  /^\/practice\/[^/]+\/do$/.test(pathname) ||
  /^\/practice\/[^/]+\/submissions\/[^/]+$/.test(pathname) ||
  pathname === '/practice/custom/do' ||
  /^\/review\/(?:memory|mistakes|[^/]+)$/.test(pathname)

export default function StudyNavigation({
  currentUser,
  users,
}: {
  currentUser: UserSummary
  users: UserSummary[]
}) {
  const pathname = usePathname()

  if (pathname.startsWith('/manage') || isFocusRoute(pathname)) return null

  return (
    <header className='editorial-nav z-40 border-b border-slate-300 bg-[#f6f5f1]/95 backdrop-blur md:sticky md:top-0'>
      <div className='mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 md:min-h-[4.5rem] md:flex-nowrap md:gap-5 md:px-8'>
        <a
          href='/'
          className='editorial-brand shrink-0 text-sm font-semibold tracking-[0.22em] text-slate-950'>
          MIMIFLOW
        </a>
        <nav
          aria-label='主要学习导航'
          className='order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1'>
          {primaryItems.map(item => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-10 shrink-0 items-center border-b px-2 text-[13px] font-medium tracking-wide transition ${
                  active
                    ? 'border-slate-900 text-slate-950'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'
                }`}>
                {item.label}
              </a>
            )
          })}
        </nav>
        <div className='ml-auto flex shrink-0 items-center gap-1'>
          <UserSwitcher currentUser={currentUser} users={users} />
          <a
            href='/search'
            className='ui-btn ui-btn-sm shrink-0 !size-9 !p-0 md:!h-9 md:!w-auto md:!px-3'
            aria-label='搜索'>
            <svg
              aria-hidden='true'
              viewBox='0 0 24 24'
              className='size-4 md:hidden'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.8'>
              <circle cx='11' cy='11' r='6.5' />
              <path d='m16 16 4 4' />
            </svg>
            <span className='hidden md:inline'>搜索</span>
          </a>
          <a
            href='/manage'
            className='inline-flex h-9 shrink-0 items-center border-b border-slate-400 px-2 text-[13px] font-medium tracking-wide text-slate-700 transition hover:border-slate-900 hover:text-slate-950 md:hidden'>
            管理
          </a>
          <a
            href='/manage'
            className='hidden h-9 items-center border-b border-transparent px-3 text-[13px] font-medium tracking-wide text-slate-500 hover:border-slate-400 hover:text-slate-950 md:inline-flex'>
            管理
          </a>
          <ResourceMenu />
        </div>
      </div>
    </header>
  )
}
