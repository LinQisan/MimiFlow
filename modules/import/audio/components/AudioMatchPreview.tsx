'use client'

import type { AudioMatchPreviewRow } from '../types'

export default function AudioMatchPreview({
  rows,
  isBatch,
  collectionLabel,
  overrides,
  onOverride,
}: {
  rows: AudioMatchPreviewRow[]
  isBatch: boolean
  collectionLabel: string
  overrides: Record<string, string>
  onOverride: (rowKey: string, value: string) => void
}) {
  return (
    <section className='border border-blue-100 bg-blue-50/30 p-4 md:p-6'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-black text-blue-900 md:text-base'>
          {isBatch ? '多音频题目录入预览' : '音频配对预览'}
        </h3>
        <span className='rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700'>
          {rows.length} 条
        </span>
      </div>

      <p className='mb-3 text-xs font-semibold text-blue-700'>
        当前集合：{collectionLabel}
      </p>

      <div className='space-y-2'>
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
            <div key={row.key} className='border border-blue-100 bg-white p-3'>
              <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                <p className='truncate text-xs font-bold text-gray-700 md:text-sm'>
                  {row.name}
                </p>
                <button
                  type='button'
                  onClick={() => onOverride(row.key, row.autoValue)}
                  className='rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100'>
                  恢复自动
                </button>
              </div>

              <p className='mb-2 text-[11px] font-medium text-blue-700'>
                自动结果：{row.autoLabel}
              </p>

              {uniqueCandidates.length > 0 ? (
                <div className='mb-2 flex flex-wrap gap-1.5'>
                  {uniqueCandidates.slice(0, 6).map(candidate => (
                    <button
                      key={`${row.key}-${candidate}`}
                      type='button'
                      onClick={() => onOverride(row.key, candidate)}
                      className='rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100'>
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
                className='w-full border border-blue-200 bg-blue-50/40 px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100'
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
