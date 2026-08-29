'use client'

import Link from 'next/link'

import { Language, useI18n } from '@/context/I18nContext'

const languages: { code: Language; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
]

export default function ResourceMenu() {
  const { lang, setLang } = useI18n()

  return (
    <details className='group relative'>
      <summary
        aria-label='更多资源'
        className='inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-lg px-0 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 marker:content-none sm:w-auto sm:px-3'>
        <span className='sm:hidden' aria-hidden='true'>•••</span>
        <span className='hidden sm:inline'>更多</span>
        <span aria-hidden className='ml-1 hidden text-[10px] text-slate-400 sm:inline'>⌄</span>
      </summary>
      <div className='absolute right-0 top-11 z-50 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg'>
        <Link href='/scores' className='block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100'>
          考试成绩
        </Link>
        <Link href='/learning-points' className='block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100'>
          学习点
        </Link>
        <Link href='/grammar' className='block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100'>
          语法库
        </Link>
        <Link href='/subtitles' className='block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100'>
          影视字幕
        </Link>
        <div className='my-2 border-t border-slate-100' />
        <p className='px-3 pb-1 text-[11px] font-semibold text-slate-400'>界面语言</p>
        <div className='grid grid-cols-3 gap-1'>
          {languages.map(item => (
            <button
              key={item.code}
              type='button'
              aria-pressed={lang === item.code}
              onClick={() => setLang(item.code)}
              className={`rounded-md px-1 py-2 text-xs font-semibold ${
                lang === item.code
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  )
}
