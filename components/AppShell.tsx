'use client'

import { useEffect, useRef, useState } from 'react'
import RouteMenu from '@/components/RouteMenu'
import { useSidebarMenu } from '@/hooks/useSidebarMenu'
import { Language, useI18n } from '@/context/I18nContext'

type AppShellLevel = {
  id: string
  title: string
}

export default function AppShell({
  children,
  levels,
}: {
  children: React.ReactNode
  levels: AppShellLevel[]
}) {
  const { t, lang, setLang } = useI18n()
  const {
    isDesktopCollapsed,
    isMobileOpen,
    toggleSidebar,
    closeMobileSidebar,
  } = useSidebarMenu()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!settingsRef.current) return
      if (!settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  return (
    <div className='flex h-screen w-full bg-white overflow-hidden'>
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
            {isDesktopCollapsed ? 'M' : 'MimiFlow'}
          </span>
        </div>

        <div className='flex-1 overflow-y-auto py-6 px-3 custom-scrollbar'>
          <RouteMenu
            collapsed={isDesktopCollapsed}
            onNavigate={closeMobileSidebar}
            levels={levels}
          />
        </div>
      </aside>

      <div className='flex-1 min-w-0 flex flex-col h-screen bg-white'>
        <header className='relative z-[90] h-16 shrink-0 flex items-center justify-between overflow-visible px-4 border-b border-gray-100 bg-white/90 backdrop-blur-md'>
          <button
            onClick={toggleSidebar}
            className='p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors active:scale-95'
            aria-label='切换菜单'>
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
          <div ref={settingsRef} className='relative z-[100] shrink-0'>
            <button
              onClick={() => setSettingsOpen(prev => !prev)}
              aria-label={t('settings.title')}
              className='w-9 h-9 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center transition-colors'>
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
                />
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                />
              </svg>
            </button>

            {settingsOpen && (
              <div className='absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 z-[120]'>
                <div className='text-[11px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                  {t('settings.language')}
                </div>
                {(
                  [
                    ['zh', '简体中文'],
                    ['en', 'English'],
                    ['ja', '日本語'],
                  ] as [Language, string][]
                ).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => {
                      setLang(code)
                      setSettingsOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium ${
                      lang === code
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <main className='flex-1 overflow-y-auto bg-gray-50/50'>{children}</main>
      </div>

      {isMobileOpen && (
        <div
          className='fixed inset-0 bg-gray-900/30 z-40 lg:hidden backdrop-blur-sm'
          onClick={closeMobileSidebar}
        />
      )}
    </div>
  )
}
