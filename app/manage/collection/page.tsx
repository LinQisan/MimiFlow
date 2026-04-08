import Link from 'next/link'

import { getCollectionManageList } from '@/lib/repositories/collection-manage.repo'

export default async function ManageCollectionPage() {
  const collections = await getCollectionManageList()

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>分组管理</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            基于 collection/material 的分组视图。选择一个分组查看听力、阅读与题库材料。
          </p>
        </section>

        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-lg font-semibold text-gray-900'>分组列表</h2>
            <Link
              href='/manage/upload'
              className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
              去上传中心
            </Link>
          </div>

          {collections.length === 0 ? (
            <p className='text-sm text-gray-500'>暂无分组，请先在上传中心创建。</p>
          ) : (
            <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3'>
              {collections.map(collection => (
                <Link
                  key={collection.id}
                  href={`/manage/collection/${collection.id}`}
                  className='border-b border-gray-200 px-2 py-4 transition-colors hover:bg-gray-50'>
                  <p className='font-semibold text-gray-900'>{collection.title}</p>
                  <p className='mt-1 text-xs text-gray-500'>
                    材料 {collection._count.materials} 条
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

