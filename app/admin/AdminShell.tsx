'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AdminSearchPanel from './AdminSearchPanel'
import { useDialog } from '@/context/DialogContext'
import { useSidebarMenu } from '@/hooks/useSidebarMenu'

type AdminLevel = {
  id: string
  title: string
}

export default function AdminShell({
  children,
  levels,
}: {
  children: React.ReactNode
  levels: AdminLevel[]
}) {
  const dialog = useDialog()
  const pathname = usePathname()

  const {
    isDesktopCollapsed,
    isMobileOpen,
    toggleSidebar,
    closeMobileSidebar,
  } = useSidebarMenu()

  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState({
    content: true,
    tools: true,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const isCurrentRoute = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const handleCreateLevel = async () => {
    const name = await dialog.prompt('请输入新大分类模块名称（如 N3、商务日语）：', {
      title: '新增分类',
      confirmText: '记录',
    })
    if (!name) return
    await dialog.alert(
      `已记录名称: ${name}\n\n(提示：请将原本 CreateLevelForm 里的 Server Action 绑定到这个按钮上即可真正保存入库)`,
    )
  }

  if (!mounted) return <div className='h-screen w-full bg-white' />

  const renderMenuLink = ({
    href,
    label,
    shortLabel,
    title,
  }: {
    href: string
    label: string
    shortLabel: string
    title?: string
  }) => {
    const active = isCurrentRoute(href)
    return (
      <Link
        key={href}
        href={href}
        onClick={closeMobileSidebar}
        title={isDesktopCollapsed ? title || label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`group block rounded-xl font-bold transition-all ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${isDesktopCollapsed ? 'py-2.5 px-0 text-center text-sm' : 'px-4 py-2.5 text-left'}`}>
        {isDesktopCollapsed ? (
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-indigo-200/70 text-indigo-800'
                : 'bg-gray-200/60 text-gray-600 group-hover:bg-gray-300/80'
            }`}>
            {shortLabel}
          </span>
        ) : (
          label
        )}
      </Link>
    )
  }

  return (
    <div className='flex h-screen w-full bg-white overflow-hidden relative'>
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 h-full bg-gray-50 border-r border-gray-200 flex flex-col shrink-0
          transition-[width,transform] duration-300 ease-in-out overflow-hidden
          ${isMobileOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
          ${isDesktopCollapsed ? 'lg:w-20' : 'lg:w-64'}
        `}>
        <div
          className={`h-16 flex items-center border-b border-gray-100 shrink-0 transition-all duration-300 ${
            isDesktopCollapsed ? 'justify-center px-0' : 'px-6'
          }`}>
          <span className='text-lg font-black text-gray-800 tracking-wide whitespace-nowrap'>
            {isDesktopCollapsed ? 'A' : 'MimiFlow Admin'}
          </span>
        </div>

        <nav className='flex-1 overflow-y-auto py-6 px-3 custom-scrollbar'>
          {isDesktopCollapsed ? (
            <div className='space-y-1'>
              {levels.map(level =>
                renderMenuLink({
                  href: `/admin/level/${level.id}`,
                  label: level.title,
                  shortLabel: level.title.charAt(0) || 'L',
                }),
              )}
              {renderMenuLink({
                href: '/admin/vocabulary',
                label: '核心词汇库',
                shortLabel: '词',
              })}
              {renderMenuLink({
                href: '/admin/upload',
                label: '语料录入',
                shortLabel: '录',
              })}
            </div>
          ) : (
            <div className='space-y-6'>
              <section>
                <button
                  type='button'
                  onClick={() =>
                    setMenuOpen(prev => ({ ...prev, content: !prev.content }))
                  }
                  aria-expanded={menuOpen.content}
                  className='w-full px-3 py-1 text-left text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between'>
                  题库专区
                  <span>{menuOpen.content ? '−' : '+'}</span>
                </button>

                {menuOpen.content && (
                  <div className='space-y-1 mt-2'>
                    {levels.map(level =>
                      renderMenuLink({
                        href: `/admin/level/${level.id}`,
                        label: level.title,
                        shortLabel: level.title.charAt(0) || 'L',
                      }),
                    )}

                    <button
                      onClick={handleCreateLevel}
                      className='w-full text-left px-4 py-2.5 rounded-xl font-bold text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-200 transition-colors'>
                      + 新增分类
                    </button>
                  </div>
                )}
              </section>

              <section>
                <button
                  type='button'
                  onClick={() =>
                    setMenuOpen(prev => ({ ...prev, tools: !prev.tools }))
                  }
                  aria-expanded={menuOpen.tools}
                  className='w-full px-3 py-1 text-left text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between'>
                  系统数据
                  <span>{menuOpen.tools ? '−' : '+'}</span>
                </button>

                {menuOpen.tools && (
                  <div className='space-y-1 mt-2'>
                    {renderMenuLink({
                      href: '/admin/vocabulary',
                      label: '核心词汇库',
                      shortLabel: '词',
                    })}
                    {renderMenuLink({
                      href: '/admin/upload',
                      label: '语料录入',
                      shortLabel: '录',
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </nav>

        <div className='p-4 border-t border-gray-200'>
          <Link
            href='/'
            className='flex items-center justify-center w-full py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap'>
            {isDesktopCollapsed ? '前' : '返回前台'}
          </Link>
        </div>
      </aside>

      <div className='flex-1 flex flex-col min-w-0 bg-white h-screen'>
        <header className='h-16 flex items-center justify-between px-4 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-md z-40'>
          <div className='flex items-center gap-4 flex-1'>
            <button
              onClick={toggleSidebar}
              className='p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors active:scale-95 shrink-0'>
              <svg
                className='w-6 h-6'
                fill='none'
                stroke='currentColor'
                strokeWidth={2}
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M4 6h16M4 12h16M4 18h16'
                />
              </svg>
            </button>

            <div className='flex-1 max-w-3xl hidden sm:block'>
              <AdminSearchPanel />
            </div>
          </div>

          <div className='w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center text-sm border border-indigo-200 shrink-0 ml-4'>
            A
          </div>
        </header>

        <div className='sm:hidden px-4 py-3 bg-white border-b border-gray-100 shrink-0 z-30'>
          <AdminSearchPanel />
        </div>

        <main className='flex-1 overflow-y-auto bg-gray-50/50 relative z-0'>
          <div className='h-full'>{children}</div>
        </main>
      </div>

      {isMobileOpen && (
        <div
          className='fixed inset-0 bg-gray-900/30 z-40 lg:hidden backdrop-blur-sm animate-in fade-in duration-300'
          onClick={closeMobileSidebar}
        />
      )}
    </div>
  )
}
