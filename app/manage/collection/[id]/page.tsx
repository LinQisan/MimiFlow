import Link from 'next/link'
import { notFound } from 'next/navigation'

import { deleteCollection, deleteCollectionMaterial } from '@/app/manage/collection/action'
import { getCollectionManageDetail } from '@/lib/repositories/collection-manage.repo'

export default async function ManageCollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const collection = await getCollectionManageDetail(id)
  if (!collection) return notFound()

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border-b border-gray-200 pb-4 md:pb-6'>
          <Link href='/manage/collection' className='text-xs font-semibold text-indigo-600 hover:text-indigo-700'>
            返回分组列表
          </Link>
          <h1 className='mt-2 text-2xl font-bold text-gray-900 md:text-3xl'>{collection.title}</h1>
          <div className='mt-3 flex gap-2'>
            <form
              action={async () => {
                'use server'
                await deleteCollection(collection.id)
              }}>
              <button
                type='submit'
                className='rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100'>
                删除分组
              </button>
            </form>
          </div>
        </section>

        <section className='space-y-4'>
          <h2 className='text-lg font-semibold text-gray-900'>听力材料</h2>
          {collection.listening.length === 0 ? (
            <p className='text-sm text-gray-500'>暂无听力材料</p>
          ) : (
            <div className='space-y-2'>
              {collection.listening.map(item => (
                <article key={item.id} className='rounded-xl border border-gray-200 bg-white p-4'>
                  <p className='font-semibold text-gray-900'>{item.title}</p>
                  <p className='mt-1 text-xs text-gray-500'>题目 {item.questionCount} · 音频 {item.audioFile || '未配置'}</p>
                  <div className='mt-3 flex gap-2'>
                    <Link
                      href={`/manage/collection/lesson/${item.legacyId}`}
                      className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                      管理
                    </Link>
                    <form
                      action={async () => {
                        'use server'
                        await deleteCollectionMaterial(item.id)
                      }}>
                      <button
                        type='submit'
                        className='rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100'>
                        删除
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className='space-y-4'>
          <h2 className='text-lg font-semibold text-gray-900'>阅读材料</h2>
          {collection.reading.length === 0 ? (
            <p className='text-sm text-gray-500'>暂无阅读材料</p>
          ) : (
            <div className='space-y-2'>
              {collection.reading.map(item => (
                <article key={item.id} className='rounded-xl border border-gray-200 bg-white p-4'>
                  <p className='font-semibold text-gray-900'>{item.title}</p>
                  <p className='mt-1 text-xs text-gray-500'>题目 {item.questionCount}</p>
                  <div className='mt-3 flex gap-2'>
                    <Link
                      href={`/manage/collection/article/${item.legacyId}`}
                      className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                      管理
                    </Link>
                    <form
                      action={async () => {
                        'use server'
                        await deleteCollectionMaterial(item.id)
                      }}>
                      <button
                        type='submit'
                        className='rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100'>
                        删除
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className='space-y-4'>
          <h2 className='text-lg font-semibold text-gray-900'>题库材料</h2>
          {collection.quizzes.length === 0 ? (
            <p className='text-sm text-gray-500'>暂无题库材料</p>
          ) : (
            <div className='space-y-2'>
              {collection.quizzes.map(item => (
                <article key={item.id} className='rounded-xl border border-gray-200 bg-white p-4'>
                  <p className='font-semibold text-gray-900'>{item.title}</p>
                  <p className='mt-1 text-xs text-gray-500'>题目 {item.questionCount}</p>
                  <div className='mt-3 flex gap-2'>
                    <Link
                      href={`/manage/collection/quiz/${item.legacyId}`}
                      className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                      管理
                    </Link>
                    <form
                      action={async () => {
                        'use server'
                        await deleteCollectionMaterial(item.id)
                      }}>
                      <button
                        type='submit'
                        className='rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100'>
                        删除
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
