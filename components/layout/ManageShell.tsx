'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const manageItems = [
  { href: '/manage', label: '概览', exact: true },
  { href: '/manage/import', label: '导入' },
  { href: '/manage/collections', label: '内容分类' },
  { href: '/manage/practice', label: '试卷' },
  { href: '/manage/listening', label: '音频材料' },
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
    <div className='min-h-screen bg-slate-50 text-slate-950'>
      <header className='z-40 border-b border-slate-200 bg-white md:sticky md:top-0'>
        <div className='mx-auto flex min-h-14 max-w-[1500px] flex-wrap items-center gap-2 px-4 py-2 md:flex-nowrap md:gap-3 md:px-6'>
          <Link href='/manage' className='shrink-0 text-sm font-black tracking-[0.16em]'>
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
                  className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
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
            <nav aria-label='管理菜单' className='mt-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2'>
              {manageItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className='rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white'>
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
