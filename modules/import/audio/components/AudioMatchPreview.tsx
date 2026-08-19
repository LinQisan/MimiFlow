'use client'

import type { AudioMatchPreviewRow } from '../types'

export default function AudioMatchPreview({
  rows,
  isBatch,
  collectionLabel,
  destinationLabel = '集合',
  overrides,
  onOverride,
}: {
  rows: AudioMatchPreviewRow[]
  isBatch: boolean
  collectionLabel: string
  destinationLabel?: string
  overrides: Record<string, string>
  onOverride: (rowKey: string, value: string) => void
}) {
  return (
    <section className='border-b border-slate-200 py-5'>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <h3 className='text-sm font-bold text-slate-900 md:text-base'>
          {isBatch ? '多音频题目录入预览' : '音频配对预览'}
        </h3>
        <span className='text-xs font-semibold text-slate-400'>
          {rows.length} 条
        </span>
      </div>

      <p className='mt-1.5 text-xs font-medium text-slate-500'>
        当前{destinationLabel}：{collectionLabel}
      </p>

      <div className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
        {rows.map(row => {
          const overrideValue = overrides[row.key] ?? row.autoValue
          const uniqueCandidates = Array.from(
            new Set([
              ...row.scopedCandidates,
              ...row.siteCandidates,
              ...row.uploadCandidates.map(() => `upload://${row.stem}`),
            ]),
          )

          return (
            <div key={row.key} className='py-3.5'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='truncate text-xs font-bold text-gray-700 md:text-sm'>
                  {row.name}
                </p>
                <button
                  type='button'
                  onClick={() => onOverride(row.key, row.autoValue)}
                  className='text-[11px] font-semibold text-slate-500 hover:text-slate-900'>
                  恢复自动
                </button>
              </div>

              <p className='mt-1 text-[11px] font-medium text-slate-500'>
                自动结果：{row.autoLabel}
              </p>

              {uniqueCandidates.length > 0 ? (
                <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
                  {uniqueCandidates.slice(0, 6).map(candidate => (
                    <button
                      key={`${row.key}-${candidate}`}
                      type='button'
                      onClick={() => onOverride(row.key, candidate)}
                      className='border-b border-slate-300 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-slate-900 hover:text-slate-900'>
                      {candidate.startsWith('upload://')
                        ? `上传同名（${row.uploadCandidates[0] || row.stem}）`
                        : candidate}
                    </button>
                  ))}
                </div>
              ) : null}

              <input
                type='text'
                value={overrideValue}
                onChange={event =>
                  onOverride(row.key, event.currentTarget.value)
                }
                placeholder='可手动填写 /audios/xxx.mp3 或 upload://词干'
                className='mt-3 !h-9 !min-h-0 w-full !rounded-none border-0 border-b border-slate-300 bg-transparent px-0 py-1 text-xs text-slate-700 outline-none focus:border-slate-900 focus:ring-0'
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
