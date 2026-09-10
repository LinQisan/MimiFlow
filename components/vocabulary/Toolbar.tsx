'use client'

import { LayoutGrid, List, ListChecks, Rows3 } from 'lucide-react'
import SegmentedControl from './SegmentedControl'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { Density } from './types'

export interface TabItem {
  key: string
  label: string
  count: number
}

/** 单行工具条（h-12）：语言 Tab 靠左，展示类控件靠右；回调全部来自客户端父级 */
export default function Toolbar({
  tabs,
  activeTab,
  onTabChange,
  showRuby,
  onToggleRuby,
  density,
  onDensityChange,
  view = 'list',
  onViewChange,
  bulkActive,
  onBulkToggle,
}: {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (key: string) => void
  showRuby: boolean
  onToggleRuby: (v: boolean) => void
  density: Density
  onDensityChange: (v: Density) => void
  view?: 'list' | 'card'
  onViewChange?: (v: 'list' | 'card') => void
  bulkActive?: boolean
  onBulkToggle?: () => void
}) {
  return (
    <div className='flex h-12 items-center justify-between gap-3 border-b border-line bg-bg px-4'>
      <div role='tablist' aria-label='语言' className='flex min-w-0 items-center gap-1 overflow-x-auto'>
        {tabs.map(tab => {
          const active = tab.key === activeTab
          return (
            <button
              key={tab.key}
              role='tab'
              aria-selected={active}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-sm transition-colors duration-150',
                active ? 'font-semibold text-primary' : 'text-fg-2 hover:text-fg-1',
                FOCUS_RING,
              )}>
              {tab.label}
              <span className={cn('ml-1 text-xs tabular-nums', active ? 'text-primary-text' : 'text-fg-3')}>
                {tab.count.toLocaleString('zh-CN')}
              </span>
            </button>
          );
        })}
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <label className='flex cursor-pointer items-center gap-2 text-sm text-fg-2'>
          <input type='checkbox' checked={showRuby} onChange={e => onToggleRuby(e.target.checked)} className='peer sr-only' />
          <span aria-hidden className='inline-flex h-5 w-9 items-center rounded-full bg-line p-0.5 transition-colors duration-150 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg'>
            <span className={cn('size-4 rounded-full bg-surface shadow-sm transition-transform duration-150', showRuby && 'translate-x-4')} />
          </span>
          注音
        </label>
        <button
          type='button'
          aria-pressed={density === 'compact'}
          title={density === 'compact' ? '切换为舒适行高' : '切换为紧凑行高'}
          onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
          className={cn(
            'grid size-8 place-items-center rounded-ctl transition-colors duration-150',
            density === 'compact' ? 'bg-primary-light text-primary-text' : 'text-fg-2 hover:bg-surface-hover hover:text-fg-1',
            FOCUS_RING,
          )}>
          <Rows3 size={16} />
        </button>
        {onViewChange && (
          <SegmentedControl
            label='视图'
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'list', label: '列表', icon: <List size={15} /> },
              { value: 'card', label: '单词卡', icon: <LayoutGrid size={15} /> },
            ]}
          />
        )}
        {onBulkToggle && (
          <button
            type='button'
            aria-pressed={!!bulkActive}
            onClick={onBulkToggle}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-ctl px-3 text-sm transition-colors duration-150',
              bulkActive ? 'bg-primary-light font-medium text-primary-text' : 'text-fg-2 hover:bg-surface-hover hover:text-fg-1',
              FOCUS_RING,
            )}>
            <ListChecks size={15} />
            批量管理
          </button>
        )}
      </div>
    </div>
  )
}
