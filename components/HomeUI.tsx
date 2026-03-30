// components/HomeUI.tsx
'use client'

import Link from 'next/link'
import { useI18n } from '@/context/I18nContext'

// 定义接收服务端传来的数据类型
interface HomeUIProps {
  dbLevels: any[]
  vocabCount: number
  sentencesCount: number
  dueSentencesCount: number
}

export default function HomeUI({
  dbLevels,
  vocabCount,
  sentencesCount,
  dueSentencesCount,
}: HomeUIProps) {
  // 🌟 这里是客户端组件，可以放心地使用 hook！
  const { t } = useI18n()

  return (
    <div className='min-h-screen bg-linear-to-br from-white via-blue-50 to-indigo-50'>
      <div className='max-w-4xl mx-auto py-6 md:py-10'>
        {/* ================= 头部导航 ================= */}
        <div className='flex justify-between items-center mb-10'>
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-semibold text-gray-800 tracking-tight'>
              MimiFlow
            </h1>

            <img src='/icon.svg' className='w-8 h-8' />
          </div>
          <Link
            href='/admin/manage'
            className='px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:text-blue-500 transition-colors font-medium text-sm flex items-center gap-2 shadow-sm '>
            <svg
              className='w-4 h-4'
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
            {t('home.admin')} {/* 🌟 翻译 */}
          </Link>
        </div>

        {/* ================= 核心学习控制台 ================= */}
        <div className='mb-14'>
          <h2 className='text-xl font-bold text-gray-800 mb-5 px-1 flex items-center gap-2'>
            <span>🔥</span> {t('home.dashboard')} {/* 🌟 翻译 */}
          </h2>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5'>
            {/* 1. 今日跟读 */}
            <Link
              href='/review'
              className='md:col-span-2 relative block p-6 md:p-8 bg-indigo-500 rounded-3xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden bg-linear-to-br from-sky-400 via-blue-400 to-indigo-400
            before:absolute before:inset-0 before:bg-white/10 before:opacity-0 
hover:before:opacity-100 before:transition
            '>
              <div className='relative z-10 flex justify-between items-start'>
                <div>
                  <h3 className='text-2xl font-bold text-white mb-2'>
                    {t('home.startReview')}
                  </h3>
                  <p className='text-indigo-100 text-sm md:text-base'>
                    {t('home.fsrsDesc')}
                  </p>
                </div>
                <div className='bg-white/20 p-3 rounded-2xl backdrop-blur-sm group-hover:rotate-12 transition-transform'>
                  <span className='text-3xl block'>🎙️</span>
                </div>
              </div>
              <div className='relative z-10 mt-8 md:mt-10 flex items-end justify-between'>
                <div>
                  <span className='text-4xl md:text-5xl font-black text-white tracking-tight'>
                    {dueSentencesCount}
                  </span>
                  <span className='text-indigo-100 text-sm md:text-base ml-3 font-medium'>
                    {t('home.dueSentences')}
                  </span>
                </div>
                <span className='bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full font-medium text-sm backdrop-blur-md transition-colors flex items-center gap-2'>
                  {t('home.enterFlow')}{' '}
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M14 5l7 7m0 0l-7 7m7-7H3'
                    />
                  </svg>
                </span>
              </div>
            </Link>

            {/* 2. 句库管理 */}
            <Link
              href='/sentences'
              className='p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300 group flex flex-col justify-between h-40'>
              <div className='flex justify-between items-start'>
                <div>
                  <h3 className='text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors mb-1'>
                    {t('home.sentenceLib')}
                  </h3>
                  <p className='text-gray-500 text-xs'>
                    {t('home.sentenceDesc')}
                  </p>
                </div>
                <div className='bg-blue-50 text-blue-500 p-2.5 rounded-xl group-hover:bg-blue-100 transition-colors'>
                  <span className='text-xl block'>🗂️</span>
                </div>
              </div>
              <div className='mt-auto flex items-end text-gray-600'>
                <span className='font-bold text-2xl leading-none'>
                  {sentencesCount}
                </span>
                <span className='text-xs ml-1.5 mb-0.5 font-medium text-gray-400'>
                  {t('home.totalSentences')}
                </span>
              </div>
            </Link>

            {/* 3. 生词本 */}
            <Link
              href='/vocabulary'
              className='p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300 group flex flex-col justify-between h-40'>
              <div className='flex justify-between items-start'>
                <div>
                  <h3 className='text-lg font-bold text-gray-800 group-hover:text-blue-500 transition-colors mb-1'>
                    {t('home.vocabBook')}
                  </h3>
                  <p className='text-gray-500 text-xs'>{t('home.vocabDesc')}</p>
                </div>
                <div className='bg-blue-50 text-blue-400 p-2.5 rounded-xl group-hover:bg-blue-100 transition-colors'>
                  <span className='text-xl block'>📚</span>
                </div>
              </div>
              <div className='mt-auto flex items-end text-gray-600'>
                <span className='font-bold text-2xl leading-none'>
                  {vocabCount}
                </span>
                <span className='text-xs ml-1.5 mb-0.5 font-medium text-gray-400'>
                  {t('home.totalVocab')}
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* ================= 课程内容库 ================= */}
        <div>
          <h2 className='text-xl font-bold text-gray-800 mb-5 px-1 flex items-center gap-2'>
            <span>🎧</span> {t('home.materials')} {/* 🌟 翻译 */}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5'>
            {dbLevels.map(level => (
              <Link
                key={level.id}
                href={`/level/${level.id}`}
                className='block p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-300 group'>
                <div className='flex justify-between items-center mb-2'>
                  <h2 className='text-lg font-bold text-gray-800 group-hover:text-blue-500  transition-colors'>
                    {level.title}
                  </h2>
                  <div className='bg-blue-50 text-blue-500  p-1.5 rounded-full group-hover:bg-blue-100  transition-colors transform group-hover:-rotate-12'>
                    <svg
                      className='w-5 h-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M9 5l7 7-7 7'
                      />
                    </svg>
                  </div>
                </div>
                <p className='text-gray-500 mt-3 text-sm leading-relaxed'>
                  {level.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
