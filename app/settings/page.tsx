'use client'

import { Language, useI18n } from '@/context/I18nContext'

const LANG_OPTIONS: { code: Language; label: string }[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
]

export default function SettingsPage() {
  const { lang, setLang, t } = useI18n()

  return (
    <main className='min-h-screen bg-gray-50 p-6 md:p-10'>
      <div className='max-w-3xl mx-auto'>
        <section className='bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm'>
          <h1 className='text-2xl md:text-3xl font-black text-gray-900 mb-2'>
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
                  className={`w-full px-4 py-3 rounded-2xl border text-left font-medium transition-colors ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span>{option.label}</span>
                  {active && (
                    <span className='ml-2 text-xs font-bold text-indigo-500'>
                      {t('settings.saved')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
