'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import RouteMenu from '@/components/RouteMenu'
import { useSidebarMenu } from '@/hooks/useSidebarMenu'
import { Language, useI18n } from '@/context/I18nContext'
import {
  getGameDifficultySettings,
  updateGameDifficultyPreset,
} from '@/app/actions/game'
import { GameDifficultyPreset } from '@prisma/client'
import { useDialog } from '@/context/DialogContext'

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
  const dialog = useDialog()
  const {
    isDesktopCollapsed,
    isMobileOpen,
    toggleSidebar,
    closeMobileSidebar,
  } = useSidebarMenu()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [difficultyPreset, setDifficultyPreset] = useState<GameDifficultyPreset>(
    GameDifficultyPreset.STANDARD,
  )
  const [difficultyPending, startDifficultyTransition] = useTransition()
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    getGameDifficultySettings()
      .then(data => {
        if (!mounted) return
        setDifficultyPreset(data.current)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

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

  useEffect(() => {
    if (!isMobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileOpen])

  return (
    <div className='flex h-screen w-full bg-white overflow-hidden'>
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 h-full bg-gray-50 border-r border-gray-200 flex flex-col shrink-0
          transition-[width,transform] duration-300 ease-in-out overflow-hidden
          ${isMobileOpen ? 'translate-x-0 w-64 ' : '-translate-x-full lg:translate-x-0'}
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

        <div className='flex-1 overflow-y-auto overscroll-contain no-scrollbar py-6 px-3'>
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
            className='ui-btn ui-btn-sm px-2'
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
              className='ui-btn h-11 w-11 px-0'>
              <svg
                className='w-6 h-6'
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
              <div className='ui-pop absolute right-0 mt-2 w-56 bg-white border border-gray-200 p-2 z-[120] space-y-2'>
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
                    className={`w-full text-left px-3 ui-mobile-py-sm text-sm font-medium ${
                      lang === code
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    {label}
                  </button>
                ))}
                <div className='border-t border-gray-100 pt-2'>
                  <div className='text-[11px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                    动态难度
                  </div>
                  <div className='flex rounded-lg border border-gray-200 bg-gray-50 p-1'>
                    {[
                      [GameDifficultyPreset.CONSERVATIVE, '保守'],
                      [GameDifficultyPreset.STANDARD, '标准'],
                      [GameDifficultyPreset.AGGRESSIVE, '激进'],
                    ].map(([preset, label]) => (
                      <button
                        key={preset}
                        type='button'
                        disabled={difficultyPending}
                        onClick={() =>
                          startDifficultyTransition(async () => {
                            setDifficultyPreset(preset as GameDifficultyPreset)
                            const res = await updateGameDifficultyPreset(
                              preset as GameDifficultyPreset,
                            )
                            if (!res.success) {
                              dialog.toast(res.message || '难度保存失败', { tone: 'error' })
                              return
                            }
                            dialog.toast(`动态难度已切换为${label}`, { tone: 'success' })
                          })
                        }
                        className={`h-8 flex-1 rounded-md text-xs font-bold transition ${
                          difficultyPreset === preset
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-gray-600 hover:bg-white'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
