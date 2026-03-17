// 文件路径：app/page.tsx
import Link from 'next/link'
import { categories } from '../data'

export default function Home() {
  return (
    <main className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-4xl mx-auto mt-10'>
        <h1 className='text-3xl font-bold mb-8 text-gray-800 tracking-tight'>
          我的听力库
        </h1>

        {/* 使用网格布局展示大分类 */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {categories.map(category => (
            <Link
              key={category.id}
              href={`/category/${category.id}`}
              className='block p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-indigo-400 transition-all duration-300 group'>
              <div className='flex justify-between items-center mb-2'>
                <h2 className='text-2xl font-bold text-gray-800 group-hover:text-indigo-600 transition-colors'>
                  {category.title}
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
              <p className='text-gray-500 mt-2 text-sm'>
                {category.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
