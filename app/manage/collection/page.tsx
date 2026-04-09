import Link from 'next/link'

import {
  clearEmptyCollections,
  deleteCollection,
  updateCollectionAttributes,
} from '@/app/manage/collection/action'
import { getCollectionManageList } from '@/lib/repositories/collection-manage.repo'

export default async function ManageCollectionPage() {
  const collections = await getCollectionManageList()

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <Link
            href='/manage'
            className='mb-2 inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 md:text-sm'>
            返回管理中心
          </Link>
          <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>分组管理</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            基于 collection/material 的分组视图。选择一个分组查看听力、阅读与题库材料。
          </p>
        </section>

        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-lg font-semibold text-gray-900'>分组列表</h2>
            <div className='flex items-center gap-2'>
              <form
                action={async () => {
                  'use server'
                  await clearEmptyCollections()
                }}>
                <button
                  type='submit'
                  className='rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100'>
                  一键清理空集合
                </button>
              </form>
              <Link
                href='/manage/upload'
                className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                去上传中心
              </Link>
            </div>
          </div>

          {collections.length === 0 ? (
            <p className='text-sm text-gray-500'>暂无分组，请先在上传中心创建。</p>
          ) : (
            <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3'>
              {collections.map(collection => (
                <article
                  key={collection.id}
                  className='space-y-3 border-b border-gray-200 px-2 py-4'>
                  <div>
                    <Link
                      href={`/manage/collection/${collection.id}`}
                      className='font-semibold text-gray-900 hover:text-indigo-700'>
                      {collection.title}
                    </Link>
                    <p className='mt-1 text-xs text-gray-500'>
                      材料 {collection._count.materials} 条 · 子集合{' '}
                      {collection._count.children} 条
                    </p>
                  </div>

                  <form
                    action={async (formData: FormData) => {
                      'use server'
                      await updateCollectionAttributes(formData)
                    }}
                    className='space-y-2 rounded-md border border-gray-100 bg-gray-50/70 p-2.5'>
                    <input type='hidden' name='collectionId' value={collection.id} />
                    <input
                      name='title'
                      defaultValue={collection.title}
                      placeholder='集合名称'
                      className='h-8 w-full border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-300'
                    />
                    <div className='grid grid-cols-2 gap-2'>
                      <input
                        name='language'
                        defaultValue={collection.language || ''}
                        placeholder='语言（ja/en/zh）'
                        className='h-8 w-full border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-300'
                      />
                      <input
                        name='level'
                        defaultValue={collection.level || ''}
                        placeholder='等级（N1/B2）'
                        className='h-8 w-full border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-300'
                      />
                    </div>
                    <input
                      name='description'
                      defaultValue={collection.description || ''}
                      placeholder='描述（可选）'
                      className='h-8 w-full border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-300'
                    />
                    <div className='grid grid-cols-[1fr_auto] gap-2'>
                      <input
                        type='number'
                        name='sortOrder'
                        defaultValue={collection.sortOrder}
                        placeholder='排序'
                        className='h-8 w-full border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-300'
                      />
                      <button
                        type='submit'
                        className='rounded-md border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                        保存属性
                      </button>
                    </div>
                  </form>

                  <div className='flex items-center gap-2'>
                    <Link
                      href={`/manage/collection/${collection.id}`}
                      className='rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50'>
                      查看材料
                    </Link>
                    <form
                      action={async () => {
                        'use server'
                        await deleteCollection(collection.id)
                      }}>
                      <button
                        type='submit'
                        className='rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100'>
                        删除集合
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
