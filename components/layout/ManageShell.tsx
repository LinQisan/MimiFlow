'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const manageItems = [
  { href: '/manage', label: '概览', exact: true },
  { href: '/manage/import', label: '导入' },
  { href: '/manage/collections', label: '内容结构' },
  { href: '/manage/practice', label: '试卷' },
  { href: '/manage/listening', label: '听力' },
  { href: '/manage/shadowing', label: '跟读' },
  { href: '/manage/reading', label: '阅读' },
  { href: '/manage/vocabulary', label: '词汇' },
  { href: '/manage/grammar', label: '语法' },
  { href: '/manage/system', label: '系统' },
]

export default function ManageShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className='min-h-screen bg-[#f6f5f1] text-slate-950'>
      <header className='editorial-nav z-40 border-b border-slate-300 bg-[#f6f5f1]/95 backdrop-blur md:sticky md:top-0'>
        <div className='mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 md:min-h-[4.5rem] md:flex-nowrap md:gap-5 md:px-8'>
          <Link href='/manage' className='editorial-brand shrink-0 text-sm font-semibold tracking-[0.18em]'>
            MIMIFLOW MANAGE
          </Link>
          <nav
            aria-label='管理导航'
            className='hidden min-w-0 items-center gap-1 md:flex md:flex-1'>
            {manageItems.map(item => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex h-10 shrink-0 items-center border-b px-2 text-[13px] font-medium tracking-wide ${
                    active
                      ? 'border-slate-900 text-slate-950'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'
                  }`}>
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <Link href='/' className='ui-btn ui-btn-sm ml-auto shrink-0'>
            返回学习
          </Link>
          <details className='order-3 w-full md:hidden'>
            <summary className='ui-btn ui-btn-sm w-full cursor-pointer list-none marker:content-none'>
              {manageItems.find(item =>
                item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`),
              )?.label || '管理菜单'}
              <span aria-hidden>⌄</span>
            </summary>
            <nav aria-label='管理菜单' className='mt-2 grid grid-cols-2 gap-1 border border-slate-200 bg-white p-2'>
              {manageItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className='border-b border-transparent px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300'>
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </header>
      {children}
    </div>
  )
}
