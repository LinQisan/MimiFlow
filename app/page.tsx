// app/page.tsx
import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

export default async function Home() {
  // 1. 获取课程大模块
  const dbLevels = await prisma.level.findMany()

  // 2. 统计生词总数 (让生词本卡片显得有数据支撑)
  const vocabCount = await prisma.vocabulary.count()

  // 3. 【预留给 FSRS 的统计接口】
  // 未来这里会写一个查询：找出现在时间大于 due (下次复习时间) 的句子数量
  // const dueSentencesCount = await prisma.sentenceReview.count({ where: { due: { lte: new Date() } } })
  const dueSentencesCount = 0 // 暂时写死 0，等我们建好 FSRS 数据库再替换

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-4xl mx-auto mt-6 md:mt-10'>
        {/* ================= 头部导航 ================= */}
        <div className='flex justify-between items-center mb-10'>
          <h1 className='text-3xl font-bold text-gray-800 tracking-tight'>
            MimiFlow
          </h1>
          <Link
            href='/admin/manage'
            className='px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-colors font-medium text-sm flex items-center gap-2 shadow-sm'>
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
            管理后台
          </Link>
        </div>

        {/* ================= 核心学习控制台 ================= */}
        <div className='mb-12'>
          <h2 className='text-xl font-bold text-gray-800 mb-4 px-1'>
            🔥 每日学习
          </h2>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {/* 1. FSRS 句子复习入口 (高优推荐) */}
            <Link
              href='/review'
              className='relative block p-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group overflow-hidden'>
              <div className='relative z-10 flex justify-between items-start'>
                <div>
                  <h3 className='text-xl font-bold text-white mb-1'>
                    智能句库复习
                  </h3>
                  <p className='text-indigo-100 text-sm'>FSRS 记忆算法驱动</p>
                </div>
                <div className='bg-white/20 p-2.5 rounded-xl backdrop-blur-sm'>
                  <span className='text-2xl block'>🧠</span>
                </div>
              </div>
              <div className='relative z-10 mt-6 flex items-end justify-between'>
                <div>
                  <span className='text-3xl font-black text-white'>
                    {dueSentencesCount}
                  </span>
                  <span className='text-indigo-100 text-sm ml-2'>句待复习</span>
                </div>
                <span className='text-white font-medium text-sm group-hover:underline decoration-2 underline-offset-4'>
                  开始打卡 &rarr;
                </span>
              </div>
              {/* 背景装饰图案 */}
              <div className='absolute -bottom-10 -right-10 text-white opacity-10 text-[100px] leading-none transform -rotate-12 group-hover:rotate-0 transition-transform duration-500'>
                ↺
              </div>
            </Link>

            {/* 2. 生词本入口 */}
            <Link
              href='/vocabulary'
              className='block p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-300 group flex flex-col justify-between'>
              <div className='flex justify-between items-start'>
                <div>
                  <h3 className='text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors mb-1'>
                    我的生词本
                  </h3>
                  <p className='text-gray-500 text-sm'>
                    结合原声语境，科学记忆
                  </p>
                </div>
                <div className='bg-orange-50 text-orange-500 p-2.5 rounded-xl group-hover:bg-orange-100 transition-colors'>
                  <span className='text-2xl block'>📚</span>
                </div>
              </div>
              <div className='mt-6 flex items-center text-gray-600'>
                <span className='font-semibold text-lg'>{vocabCount}</span>
                <span className='text-sm ml-1.5'>个已收藏生词</span>
              </div>
            </Link>
          </div>
        </div>

        {/* ================= 课程内容库 ================= */}
        <div>
          <h2 className='text-xl font-bold text-gray-800 mb-4 px-1'>
            🎧 听力与跟读素材
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
            {dbLevels.map(level => (
              <Link
                key={level.id}
                href={`/level/${level.id}`}
                className='block p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-indigo-400 transition-all duration-300 group'>
                <div className='flex justify-between items-center mb-2'>
                  <h2 className='text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors'>
                    {level.title}
                  </h2>
                  <div className='bg-indigo-50 text-indigo-500 p-1.5 rounded-full group-hover:bg-indigo-500 group-hover:text-white transition-colors'>
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
                <p className='text-gray-500 mt-2 text-sm'>
                  {level.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
