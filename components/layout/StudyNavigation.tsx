'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ResourceMenu from './ResourceMenu'

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
  pathname === '/practice/custom/do' ||
  /^\/review\/(?:memory|mistakes|[^/]+)$/.test(pathname)

export default function StudyNavigation() {
  const pathname = usePathname()

  if (pathname.startsWith('/manage') || isFocusRoute(pathname)) return null

  return (
    <header className='editorial-nav z-40 border-b border-slate-300 bg-[#f6f5f1]/95 backdrop-blur md:sticky md:top-0'>
      <div className='mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 md:min-h-[4.5rem] md:flex-nowrap md:gap-5 md:px-8'>
        <Link
          href='/'
          className='editorial-brand shrink-0 text-sm font-semibold tracking-[0.22em] text-slate-950'>
          MIMIFLOW
        </Link>
        <nav
          aria-label='主要学习导航'
          className='order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1'>
          {primaryItems.map(item => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-10 shrink-0 items-center border-b px-2 text-[13px] font-medium tracking-wide transition ${
                  active
                    ? 'border-slate-900 text-slate-950'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'
                }`}>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className='ml-auto flex shrink-0 items-center gap-1'>
          <Link href='/search' className='ui-btn ui-btn-sm' aria-label='搜索'>
            搜索
          </Link>
          <ResourceMenu />
        </div>
      </div>
    </header>
  )
}
