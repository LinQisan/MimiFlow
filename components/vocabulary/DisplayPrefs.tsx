'use client'

import { useState } from 'react'
import Toolbar, { type TabItem } from './Toolbar'
import { useVocabNav } from './useVocabNav'
import type { Density } from './types'

/**
 * 最小的展示状态岛：注音 / 密度 / 视图只改 data-* 属性或本地 state，
 * 从不 dependent 服务端数据；筛选类状态全部走 URL（见 useVocabNav）。
 * children 必须是 Server 渲染好的列表节点（可序列化，无函数 props）。
 */
export default function DisplayPrefs({
  tabs,
  list,
  cards,
  belowToolbar,
  onBulkToggle,
  bulkActive,
}: {
  tabs: TabItem[]
  list: React.ReactNode
  cards?: React.ReactNode
  /** toolbar 与列表之间的节点（如 sticky 筛选栏），随 data 属性一起渲染 */
  belowToolbar?: React.ReactNode
  onBulkToggle?: () => void
  bulkActive?: boolean
}) {
  const [ruby, setRuby] = useState(true)
  const [density, setDensity] = useState<Density>('comfortable')
  const [view, setView] = useState<'list' | 'card'>('list')
  const { filters, update } = useVocabNav()

  return (
    <div data-ruby={ruby ? 'on' : 'off'} data-density={density}>
      <Toolbar
        tabs={tabs}
        activeTab={filters.lang}
        onTabChange={lang => update({ lang })}
        showRuby={ruby}
        onToggleRuby={setRuby}
        density={density}
        onDensityChange={setDensity}
        view={view}
        onViewChange={cards ? setView : undefined}
        bulkActive={bulkActive}
        onBulkToggle={onBulkToggle}
      />
      {belowToolbar}
      {view === 'card' && cards ? cards : list}
    </div>
  )
}
