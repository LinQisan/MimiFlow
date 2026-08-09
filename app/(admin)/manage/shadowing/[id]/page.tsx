import Link from 'next/link'
import { notFound } from 'next/navigation'

import DeleteAudioMaterialButton from '@/features/listening/ui/DeleteAudioMaterialButton'
import LessonSiblingNav from '@/features/collections/ui/LessonSiblingNav'
import ListeningTitleForm from '@/features/listening/ui/ListeningTitleForm'
import { getSpeakingEditData } from '@/lib/repositories/collection/manage'

export default async function ManageShadowingEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const material = await getSpeakingEditData(id)
  if (!material) return notFound()

  return (
    <main className='min-h-screen bg-slate-50 px-3 py-4 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <nav className='flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500'>
          <Link href='/manage/shadowing' className='text-indigo-600 hover:text-indigo-800'>
            ← 返回跟读材料
          </Link>
          <span className='text-slate-300'>/</span>
          <span>{material.collectionTitle}</span>
          <span className='text-slate-300'>/</span>
          <span className='truncate text-slate-400'>{material.title}</span>
        </nav>

        <LessonSiblingNav
          lessons={material.siblings}
          currentLessonId={material.id}
          hrefBase='/manage/shadowing'
        />

        <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700'>
                  跟读材料
                </span>
                <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>
                  {material.dialogues.length} 句文本
                </span>
              </div>
              <h1 className='mt-3 text-2xl font-black text-slate-950 md:text-3xl'>{material.title}</h1>
              <p className='mt-1 text-sm text-slate-500'>所属：{material.collectionTitle}</p>
            </div>
            <div className='flex shrink-0 flex-wrap gap-2'>
              <Link href={`/listening/${material.id}`} className='ui-btn ui-btn-sm'>试听</Link>
              <DeleteAudioMaterialButton
                id={material.id}
                title={material.title}
                materialType='SPEAKING'
                questionCount={0}
                collectionLabel={material.collectionTitle}
                redirectAfterDelete
                redirectHref='/manage/shadowing'
              />
            </div>
          </div>

          <div className='mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]'>
            <ListeningTitleForm id={material.id} title={material.title} />
            <div className='min-w-0 rounded-xl bg-slate-50 p-3'>
              <p className='text-[11px] font-bold tracking-wide text-slate-400 uppercase'>音频</p>
              {material.audioFile ? (
                <>
                  <audio controls preload='metadata' src={material.audioFile} className='mt-2 h-9 w-full' />
                  <p className='mt-2 truncate font-mono text-[11px] text-slate-500'>{material.audioFile}</p>
                </>
              ) : (
                <p className='mt-2 text-sm font-semibold text-rose-600'>音频未设置</p>
              )}
            </div>
          </div>
        </section>

        <section className='rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm leading-6 text-slate-700'>
          跟读材料不配置听力题目，主要维护音频、标题、字幕时间轴以及教材章节归类。
        </section>

        <details className='group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' open>
          <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-slate-800 marker:content-none md:px-5'>
            <span>字幕与时间轴</span>
            <span className='text-xs font-semibold text-slate-400'>{material.dialogues.length} 句</span>
          </summary>
          <div className='border-t border-slate-200'>
            <div className='divide-y divide-slate-100 px-3 md:px-4'>
              {material.dialogues.length === 0 ? (
                <div className='py-10 text-center text-sm text-slate-400'>暂无字幕数据</div>
              ) : material.dialogues.map(dialogue => (
                <div key={`${dialogue.id}-${dialogue.start}`} className='grid gap-1 py-3 md:grid-cols-[9rem_1fr] md:gap-4'>
                  <div className='font-mono text-xs font-semibold text-violet-700 md:text-right'>
                    {dialogue.start.toFixed(2)} → {dialogue.end.toFixed(2)}
                  </div>
                  <p className='text-sm leading-6 text-slate-800'>{dialogue.text}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </main>
  )
}
