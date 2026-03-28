import Link from 'next/link'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

export default async function Home() {
  const dbLevels = await prisma.level.findMany()
  return (
    <main className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-4xl mx-auto mt-10'>
        <div className='flex justify-between items-end mb-8'>
          <h1 className='text-3xl font-bold text-gray-800 tracking-tight'>
            MimiFlow
          </h1>
          <Link
            href='/admin/upload'
            className='px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors font-medium text-sm flex items-center gap-2'>
            上传新题库
          </Link>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {dbLevels.map(level => (
            <Link
              key={level.id}
              href={`/level/${level.id}`}
              className='block p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-indigo-400 transition-all duration-300 group'>
              <div className='flex justify-between items-center mb-2'>
                <h2 className='text-2xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors'>
                  {level.title}
                </h2>
                <div className='bg-indigo-50 text-indigo-500 p-2 rounded-full group-hover:bg-indigo-500 group-hover:text-white transition-colors'>
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
              <p className='text-gray-500 mt-2 text-sm'>{level.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
