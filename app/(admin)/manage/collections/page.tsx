import Link from 'next/link'

import {
  buildCollectionTree,
  buildCollectionTreeOptions,
} from '@/lib/repositories/collection/tree'
import { getCollectionManageList } from '@/lib/repositories/collection/manage'
import {
  ClearEmptyPapersButton,
  CollectionEditor,
} from './CollectionEditor'

type CollectionRow = Awaited<ReturnType<typeof getCollectionManageList>>[number]
type CollectionNode = CollectionRow & { children: CollectionNode[] }

const typeMeta: Record<
  CollectionRow['collectionType'],
  { label: string; className: string }
> = {
  LIBRARY_ROOT: {
    label: '系统根分类',
    className: 'bg-slate-900 text-white',
  },
  BOOK: { label: '教材 / 合集', className: 'bg-blue-50 text-blue-700' },
  CHAPTER: { label: '章节', className: 'bg-cyan-50 text-cyan-700' },
  PAPER: { label: '正式试卷', className: 'bg-violet-50 text-violet-700' },
  CUSTOM_GROUP: {
    label: '自定义分组',
    className: 'bg-amber-50 text-amber-800',
  },
  FAVORITES: { label: '收藏夹', className: 'bg-rose-50 text-rose-700' },
}

const parentTypeByType: Partial<
  Record<CollectionRow['collectionType'], CollectionRow['collectionType'][]>
> = {
  BOOK: ['LIBRARY_ROOT'],
  CHAPTER: ['BOOK'],
  CUSTOM_GROUP: ['CUSTOM_GROUP'],
  FAVORITES: ['CUSTOM_GROUP'],
}

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
  allCollections,
}: {
  node: CollectionNode
  pathLabel: string
  allCollections: CollectionRow[]
}) {
  const invalidParentIds = collectDescendantIds(node)
  invalidParentIds.add(node.id)
  const allowedParentTypes = parentTypeByType[node.collectionType] || []
  const parentOptions = buildCollectionTreeOptions(
    allCollections.filter(
      item =>
        allowedParentTypes.includes(item.collectionType) &&
        !invalidParentIds.has(item.id),
    ),
  ).map(item => ({ id: item.id, label: item.pathLabel || item.title }))
  const canDelete =
    node.collectionType !== 'LIBRARY_ROOT' &&
    node._count.materials === 0 &&
    node._count.children === 0
  const meta = typeMeta[node.collectionType]

  return (
    <article className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0 space-y-1.5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href={`/manage/collections/${node.id}`}
              className='truncate text-base font-bold text-slate-900 hover:text-indigo-700 md:text-lg'>
              {node.title}
            </Link>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <p className='text-xs text-slate-500'>位置：{pathLabel}</p>
          <p className='text-xs text-slate-500'>
            {node._count.materials} 条材料 · {node._count.children} 个下级
          </p>
        </div>
        <Link
          href={`/manage/collections/${node.id}`}
          className='ui-btn ui-btn-sm shrink-0'>
          查看直接内容
        </Link>
      </div>

      <details className='group mt-3 rounded-xl border border-slate-100 bg-slate-50/70'>
        <summary className='flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 marker:content-none'>
          调整名称、位置与顺序
          <span className='text-slate-400 group-open:hidden'>展开</span>
          <span className='hidden text-slate-400 group-open:inline'>收起</span>
        </summary>
        <CollectionEditor
          collection={node}
          parentOptions={parentOptions}
          canDelete={canDelete}
        />
      </details>

      {node.children.length > 0 && (
        <details className='group mt-3' open={node.collectionType === 'LIBRARY_ROOT'}>
          <summary className='cursor-pointer text-xs font-semibold text-slate-600'>
            {node.children.length} 个下级
            <span className='ml-2 text-slate-400 group-open:hidden'>展开</span>
            <span className='ml-2 hidden text-slate-400 group-open:inline'>收起</span>
          </summary>
          <div className='mt-3 space-y-3 border-l border-slate-200 pl-3 md:pl-4'>
            {node.children.map(child => (
              <CollectionTreeCard
                key={child.id}
                node={child}
                pathLabel={`${pathLabel} / ${child.title}`}
                allCollections={allCollections}
              />
            ))}
          </div>
        </details>
      )}
    </article>
  )
}

function StructureSection({
  title,
  description,
  nodes,
  allCollections,
  emptyText,
}: {
  title: string
  description: string
  nodes: CollectionNode[]
  allCollections: CollectionRow[]
  emptyText: string
}) {
  return (
    <section className='space-y-4 border-t border-slate-200 pt-6'>
      <div>
        <h2 className='text-lg font-bold text-slate-950'>{title}</h2>
        <p className='mt-1 text-sm text-slate-500'>{description}</p>
      </div>
      {nodes.length === 0 ? (
        <p className='rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500'>
          {emptyText}
        </p>
      ) : (
        <div className='space-y-4'>
          {nodes.map(node => (
            <CollectionTreeCard
              key={node.id}
              node={node}
              pathLabel={node.title}
              allCollections={allCollections}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default async function ManageCollectionPage() {
  const collections = await getCollectionManageList()
  const libraryCollections = collections.filter(item =>
    ['LIBRARY_ROOT', 'BOOK', 'CHAPTER'].includes(item.collectionType),
  )
  const customCollections = collections.filter(item =>
    ['CUSTOM_GROUP', 'FAVORITES'].includes(item.collectionType),
  )
  const papers = collections.filter(item => item.collectionType === 'PAPER')
  const structuralCollections = [...libraryCollections, ...customCollections]
  const materialCount = structuralCollections.reduce(
    (total, item) => total + item._count.materials,
    0,
  )
  const emptyEditableCount = structuralCollections.filter(
    item =>
      item.collectionType !== 'LIBRARY_ROOT' &&
      item._count.materials === 0 &&
      item._count.children === 0,
  ).length

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='border-b border-slate-200 pb-6'>
          <p className='text-xs font-bold tracking-[0.16em] text-indigo-600 uppercase'>
            Structure
          </p>
          <h1 className='mt-2 text-2xl font-black text-slate-950 md:text-3xl'>
            内容结构
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-600'>
            管理资料库、教材、章节和自定义分组的层级。题目、音频和正文请到对应的内容页面编辑。
          </p>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Link href='/manage/import' className='ui-btn ui-btn-sm ui-btn-primary'>
              导入新内容
            </Link>
            <Link href='/manage/listening' className='ui-btn ui-btn-sm'>
              管理听力材料
            </Link>
            <Link href='/manage/shadowing' className='ui-btn ui-btn-sm'>
              管理跟读材料
            </Link>
            <Link href='/manage/practice' className='ui-btn ui-btn-sm'>
              管理正式试卷
            </Link>
          </div>
        </header>

        <section className='grid grid-cols-1 gap-3 sm:grid-cols-3' aria-label='结构统计'>
          {[
            ['结构节点', String(libraryCollections.length + customCollections.length)],
            ['归属材料', String(materialCount)],
            ['可删除空节点', String(emptyEditableCount)],
          ].map(([label, value]) => (
            <div key={label} className='rounded-xl border border-slate-200 bg-white p-4'>
              <p className='text-xs font-semibold text-slate-500'>{label}</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>{value}</p>
            </div>
          ))}
        </section>

        <StructureSection
          title='资料库层级'
          description='系统根分类下放教材，教材下放章节。这里调整结构，跟读材料页负责教材与章节归类。'
          nodes={buildCollectionTree(libraryCollections as CollectionNode[])}
          allCollections={collections}
          emptyText='尚未创建资料库结构，可前往跟读材料页创建教材与章节。'
        />

        <StructureSection
          title='自定义分组'
          description='用于临时整理或精选内容，不与正式试卷混用。'
          nodes={buildCollectionTree(customCollections as CollectionNode[])}
          allCollections={collections}
          emptyText='暂无自定义分组。'
        />

        <section className='rounded-2xl border border-violet-200 bg-violet-50/60 p-5'>
          <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
            <div>
              <h2 className='text-base font-bold text-slate-950'>正式试卷</h2>
              <p className='mt-1 text-sm leading-6 text-slate-600'>
                共 {papers.length} 份试卷，包含{' '}
                {papers.reduce((sum, item) => sum + item._count.materials, 0)}{' '}
                个分区材料。试卷结构与题目统一在试卷页维护。
              </p>
            </div>
            <Link href='/manage/practice' className='ui-btn ui-btn-sm shrink-0'>
              前往试卷管理
            </Link>
          </div>
          <details className='mt-4 border-t border-violet-200 pt-3'>
            <summary className='cursor-pointer text-xs font-semibold text-slate-500'>
              试卷维护工具
            </summary>
            <div className='mt-3'>
              <ClearEmptyPapersButton />
            </div>
          </details>
        </section>
      </div>
    </main>
  )
}
