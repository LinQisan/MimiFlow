'use client'

import { useEffect, useTransition, useState } from 'react'
import { Language, useI18n } from '@/context/I18nContext'
import { GameDifficultyPreset } from '@prisma/client'
import {
  getGameDifficultySettings,
  updateGameDifficultyPreset,
} from '@/app/actions/game'
import { useDialog } from '@/context/DialogContext'

const LANG_OPTIONS: { code: Language; label: string }[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
]

export default function SettingsPage() {
  const { lang, setLang, t } = useI18n()
  const dialog = useDialog()
  const [difficultyPreset, setDifficultyPreset] = useState<GameDifficultyPreset>(
    GameDifficultyPreset.STANDARD,
  )
  const [difficultyPending, startDifficultyTransition] = useTransition()

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

  return (
    <main className='min-h-screen bg-gray-50 p-6 md:p-10'>
      <div className='max-w-3xl mx-auto'>
        <section className='border-b border-gray-200 pb-6 md:pb-8'>
          <h1 className='text-2xl md:text-3xl font-bold text-gray-900 mb-2'>
            {t('settings.title')}
          </h1>
          <p className='text-sm text-gray-500 mb-6'>{t('settings.languageDesc')}</p>

          <div className='space-y-3'>
            {LANG_OPTIONS.map(option => {
              const active = lang === option.code
              return (
                <button
                  key={option.code}
                  onClick={() => setLang(option.code)}
                  className={`w-full px-2 ui-mobile-py-sm border-b text-left text-base font-medium transition-colors ${
                    active
                      ? 'border-indigo-300 bg-indigo-50/50 text-indigo-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span>{option.label}</span>
                  {active && (
                    <span className='ml-2 text-xs font-semibold text-indigo-500'>
                      {t('settings.saved')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className='mt-6 border-t border-gray-200 pt-5'>
            <h2 className='text-lg font-bold text-gray-900'>动态难度</h2>
            <p className='mt-1 text-sm text-gray-500'>
              根据最近完成度自动升降目标。可选保守/标准/激进。
            </p>
            <div className='mt-3 grid grid-cols-3 gap-2'>
              {[
                [GameDifficultyPreset.CONSERVATIVE, '保守', '节奏平稳，波动更小'],
                [GameDifficultyPreset.STANDARD, '标准', '平衡推进，推荐默认'],
                [GameDifficultyPreset.AGGRESSIVE, '激进', '完成好时上调更快'],
              ].map(([preset, label, hint]) => (
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
                        dialog.toast(res.message || '保存失败', { tone: 'error' })
                        return
                      }
                      dialog.toast(`动态难度已设为${label}`, { tone: 'success' })
                    })
                  }
                  className={`border px-3 py-3 text-left transition ${
                    difficultyPreset === preset
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                  <p className='text-sm font-bold text-gray-900'>{label}</p>
                  <p className='mt-1 text-xs text-gray-500'>{hint}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
