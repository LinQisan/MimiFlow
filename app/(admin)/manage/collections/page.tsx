import Link from 'next/link'
import CustomSelect from '@/components/ui/CustomSelect'

import {
  clearEmptyCollections,
  deleteCollection,
  updateCollectionAttributes,
} from '@/app/(library)/collections/action'
import { buildCollectionTree, buildCollectionTreeOptions } from '@/lib/repositories/collection/tree'
import { getCollectionManageList } from '@/lib/repositories/collection/manage'

type CollectionRow = Awaited<ReturnType<typeof getCollectionManageList>>[number]
type CollectionNode = CollectionRow & {
  children: CollectionNode[]
}

const toTypeLabel = (type: CollectionRow['collectionType']) => {
  if (type === 'PAPER') return '试卷'
  if (type === 'CUSTOM_GROUP') return '分组'
  return '收藏夹'
}

const shortId = (id: string) => id.slice(0, 8)

function collectDescendantIds(node: CollectionNode): Set<string> {
  const ids = new Set<string>()
  const walk = (current: CollectionNode) => {
    for (const child of current.children) {
      ids.add(child.id)
      walk(child)
    }
  }
  walk(node)
  return ids
}

function CollectionTreeCard({
  node,
  pathLabel,
  parentOptions,
}: {
  node: CollectionNode
  pathLabel: string
  parentOptions: { id: string; label: string }[]
}) {
  const invalidParentIds = collectDescendantIds(node)
  invalidParentIds.add(node.id)

  return (
    <article
      className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md'
    >
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0 space-y-1.5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href={`/manage/collections/${node.id}`}
              className='truncate text-base font-semibold text-slate-900 hover:text-indigo-700 md:text-lg'>
              {node.title}
            </Link>
            <span className='rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600'>
              {toTypeLabel(node.collectionType)}
            </span>
          </div>
          <p className='text-xs text-slate-500'>
            路径：{pathLabel || node.title}
          </p>
          <p className='text-xs text-slate-500'>
            材料 {node._count.materials} 条 · 子集合 {node._count.children} 条 · 排序 {node.sortOrder}
          </p>
        </div>

        <div className='flex gap-2'>
          <Link
            href={`/manage/collections/${node.id}`}
            className='rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'>
            打开内容
          </Link>
        </div>
      </div>

      <details className='group mt-3 rounded-xl border border-slate-100 bg-slate-50/70'>
        <summary className='flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 marker:content-none'>
          编辑分类信息
          <span className='text-slate-400 group-open:hidden'>展开</span>
          <span className='hidden text-slate-400 group-open:inline'>收起</span>
        </summary>
        <div className='border-t border-slate-200 p-3'>
          <p className='mb-3 text-xs text-slate-400'>ID #{shortId(node.id)}</p>
          <form
            action={async (formData: FormData) => {
              'use server'
              await updateCollectionAttributes(formData)
            }}
            className='space-y-2'>
        <input type='hidden' name='collectionId' value={node.id} />
        <div className='grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_0.9fr_0.8fr]'>
          <input
            name='title'
            defaultValue={node.title}
            placeholder='集合名称'
            className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
          />
          <CustomSelect
            name='parentId'
            defaultValue={node.parentId || ''}
            className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
            <option value=''>顶层集合</option>
            {parentOptions.map(option => (
              <option
                key={option.id}
                value={option.id}
                disabled={invalidParentIds.has(option.id)}>
                {option.label}
              </option>
            ))}
          </CustomSelect>
          <div className='grid grid-cols-2 gap-2'>
            <input
              name='language'
              defaultValue={node.language || ''}
              placeholder='语言'
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
            <input
              name='level'
              defaultValue={node.level || ''}
              placeholder='等级'
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
          </div>
        </div>
        <div className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]'>
          <textarea
            name='description'
            defaultValue={node.description || ''}
            placeholder='描述（可选）'
            className='min-h-20 resize-y border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
          />
          <div className='space-y-2'>
            <input
              type='number'
              name='sortOrder'
              defaultValue={node.sortOrder}
              placeholder='排序'
              className='h-10 w-full border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
            <button
              type='submit'
              className='h-10 w-full rounded-md border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100'>
              保存属性
            </button>
          </div>
        </div>
          </form>
          <form
            action={async () => {
              'use server'
              await deleteCollection(node.id)
            }}
            className='mt-3 border-t border-slate-200 pt-3'>
            <button
              type='submit'
              className='rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100'>
              删除分类
            </button>
          </form>
        </div>
      </details>

      {node.children.length > 0 && (
        <details className='group mt-3'>
          <summary className='cursor-pointer text-xs font-semibold text-slate-600'>
            {node.children.length} 个子分类
            <span className='ml-2 text-slate-400 group-open:hidden'>展开</span>
            <span className='ml-2 hidden text-slate-400 group-open:inline'>收起</span>
          </summary>
          <div className='mt-3 space-y-3 border-l border-slate-200 pl-3 md:pl-4'>
            {node.children.map(child => (
              <CollectionTreeCard
                key={child.id}
                node={child}
                pathLabel={`${pathLabel} / ${child.title}`}
                parentOptions={parentOptions}
              />
            ))}
          </div>
        </details>
      )}
    </article>
  )
}

export default async function ManageCollectionPage() {
  const collections = await getCollectionManageList()
  const tree = buildCollectionTree(collections as CollectionNode[])
  const flatOptions = buildCollectionTreeOptions(collections).map(item => ({
    id: item.id,
    label: `${item.pathLabel || item.title} · #${shortId(item.id)}`,
  }))

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border-b border-gray-200 pb-4 md:pb-6'>
          <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>
            内容分类
          </h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            只维护集合层级与归属；材料内容和题目进入对应页面编辑。
          </p>
        </section>

        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-lg font-semibold text-gray-900'>分类层级</h2>
            <div className='flex items-center gap-2'>
              <Link
                href='/manage/import'
                className='rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100'>
                导入内容
              </Link>
            </div>
          </div>

          {collections.length === 0 ? (
            <p className='text-sm text-gray-500'>
              暂无集合，请先在上传中心创建。
            </p>
          ) : (
            <div className='space-y-4'>
              {tree.map(node => (
                <CollectionTreeCard
                  key={node.id}
                  node={node}
                  pathLabel={node.title}
                  parentOptions={flatOptions}
                />
              ))}
            </div>
          )}
          <details className='mt-5 border-t border-slate-200 pt-4'>
            <summary className='cursor-pointer text-xs font-semibold text-slate-500'>
              分类维护
            </summary>
            <form
              action={async () => {
                'use server'
                await clearEmptyCollections()
              }}
              className='mt-3'>
              <button
                type='submit'
                className='rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100'>
                清理全部空分类
              </button>
            </form>
          </details>
        </section>
      </div>
    </main>
  )
}
