import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getCollectionManageDetail } from '@/lib/repositories/collection/manage'
import {
  DeleteCollectionButton,
  DeleteMaterialButton,
} from '../CollectionEditor'

type CollectionDetail = NonNullable<
  Awaited<ReturnType<typeof getCollectionManageDetail>>
>
type MaterialItem = CollectionDetail['audio'][number]

const typeLabels: Record<CollectionDetail['collectionType'], string> = {
  LIBRARY_ROOT: '系统根分类',
  BOOK: '教材 / 合集',
  CHAPTER: '章节',
  PAPER: '正式试卷',
  CUSTOM_GROUP: '自定义分组',
  FAVORITES: '收藏夹',
}

function getManageHref(item: MaterialItem, collectionId: string) {
  if (item.type === 'SPEAKING') return `/manage/shadowing/${item.materialId}`
  if (item.type === 'LISTENING') {
    return `/manage/listening/${item.materialId}#questions`
  }
  if (item.type === 'READING') {
    return `/manage/reading/${item.materialId}`
  }
  if (item.type === 'VOCAB_GRAMMAR') {
    return `/manage/questions/${item.materialId}`
  }
  return `/manage/collections/${collectionId}`
}

function MaterialSection({
  title,
  emptyText,
  items,
  collectionId,
}: {
  title: string
  emptyText: string
  items: MaterialItem[]
  collectionId: string
}) {
  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between border-b border-slate-200 pb-2'>
        <h2 className='text-base font-bold text-slate-950'>{title}</h2>
        <span className='text-xs font-semibold text-slate-500'>{items.length} 条</span>
      </div>
      {items.length === 0 ? (
        <p className='py-3 text-sm text-slate-500'>{emptyText}</p>
      ) : (
        <div className='divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white'>
          {items.map(item => (
            <article
              key={item.id}
              className='flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between'>
              <div className='min-w-0'>
                <p className='truncate font-semibold text-slate-900'>{item.title}</p>
                <p className='mt-1 text-xs text-slate-500'>
                  {item.type === 'SPEAKING'
                    ? '跟读材料'
                    : item.type === 'LISTENING'
                      ? '听力材料'
                      : item.type === 'READING'
                        ? '阅读材料'
                        : '题库材料'}{' '}
                  · {item.questionCount} 题
                  {item.audioFile ? ` · ${item.audioFile}` : ''}
                </p>
              </div>
              <div className='flex shrink-0 gap-2'>
                <Link
                  href={getManageHref(item, collectionId)}
                  className='ui-btn ui-btn-sm ui-btn-primary'>
                  编辑内容
                </Link>
                <DeleteMaterialButton id={item.id} title={item.title} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function ManageCollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const collection = await getCollectionManageDetail(id)
  if (!collection) return notFound()

  const totalMaterials =
    collection.audio.length + collection.reading.length + collection.quizzes.length
  const canDelete =
    collection.collectionType !== 'LIBRARY_ROOT' &&
    collection.childCount === 0 &&
    totalMaterials === 0

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <header className='border-b border-slate-200 pb-6'>
          <Link
            href='/manage/collections'
            className='text-xs font-semibold text-indigo-600 hover:text-indigo-700'>
            ← 返回内容结构
          </Link>
          <div className='mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-2xl font-black text-slate-950 md:text-3xl'>
                  {collection.title}
                </h1>
                <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'>
                  {typeLabels[collection.collectionType]}
                </span>
              </div>
              <p className='mt-2 text-sm text-slate-500'>
                {collection.parent ? `上级：${collection.parent.title} · ` : ''}
                {totalMaterials} 条直接材料 · {collection.childCount} 个下级
              </p>
              {collection.description && (
                <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-600'>
                  {collection.description}
                </p>
              )}
            </div>
            <DeleteCollectionButton
              id={collection.id}
              title={collection.title}
              canDelete={canDelete}
            />
          </div>
        </header>

        {collection.collectionType === 'PAPER' && (
          <section className='flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 md:flex-row md:items-center md:justify-between'>
            <p className='text-sm text-slate-700'>
              这是正式试卷。为避免分区与题目脱节，请在试卷管理页统一编辑。
            </p>
            <Link
              href={`/manage/practice/${collection.id}`}
              className='ui-btn ui-btn-sm shrink-0'>
              打开试卷管理
            </Link>
          </section>
        )}

        {collection.children.length > 0 && (
          <section className='space-y-3'>
            <div className='flex items-center justify-between border-b border-slate-200 pb-2'>
              <h2 className='text-base font-bold text-slate-950'>下级结构</h2>
              <span className='text-xs font-semibold text-slate-500'>
                {collection.children.length} 个
              </span>
            </div>
            <div className='grid gap-2 md:grid-cols-2'>
              {collection.children.map(child => (
                <Link
                  key={child.id}
                  href={`/manage/collections/${child.id}`}
                  className='rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:bg-indigo-50/40'>
                  <p className='font-semibold text-slate-900'>{child.title}</p>
                  <p className='mt-1 text-xs text-slate-500'>
                    {typeLabels[child.collectionType]} · {child._count.materials}{' '}
                    条直接材料 · {child._count.children} 个下级
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <MaterialSection
          title='音频材料'
          emptyText='暂无听力或跟读材料'
          items={collection.audio}
          collectionId={collection.id}
        />
        <MaterialSection
          title='阅读材料'
          emptyText='暂无阅读材料'
          items={collection.reading}
          collectionId={collection.id}
        />
        <MaterialSection
          title='题库材料'
          emptyText='暂无题库材料'
          items={collection.quizzes}
          collectionId={collection.id}
        />
      </div>
    </main>
  )
}
