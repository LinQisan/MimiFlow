import type { FilterState } from './types'

/** 与真实路由 ?group= / ?wordbook= 对齐：lang 承载分组键，book 承载单词书 id */
export const DEFAULT_FILTERS: FilterState = {
  lang: 'all',
  q: '',
  sort: 'recent',
  pos: 'all',
  tag: 'all',
  book: 'all',
  page: 1,
}

type RawParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] || '') : (value || '')

const pageOf = (value: string | string[] | undefined): number => {
  const parsed = Math.floor(Number(first(value)))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function parseFilters(sp: RawParams): FilterState {
  return {
    lang: first(sp.lang || sp.group) || 'all',
    q: first(sp.q).slice(0, 50),
    sort: first(sp.sort) || 'recent',
    pos: first(sp.pos) || 'all',
    tag: first(sp.tag) || 'all',
    book: first(sp.book || sp.wordbook) || 'all',
    page: pageOf(sp.page),
  }
}

/** 把 patch 合并进当前参数并序列化；改筛选类条件时调用方负责 page=1 */
export function buildQuery(
  current: Record<string, string>,
  patch: Record<string, string | number>,
): string {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(patch)) {
    const text = String(value).trim()
    if (!text || text === 'all' || (key === 'sort' && text === 'recent') || (key === 'page' && text === '1')) {
      next.delete(key)
    } else {
      next.set(key, text)
    }
  }
  const query = next.toString()
  return query ? `?${query}` : '?'
}

/**
 * 把完整 FilterState 序列化为 query（去掉默认值），供 focus 跳转保留筛选。
 * omit 跳过某些键（如页码），extra 透传非筛选参数（如 ui=v2）。
 */
export function serializeFilters(
  filters: FilterState,
  omit: Array<keyof FilterState> = [],
  extra: Record<string, string> = {},
): string {
  const patch: Record<string, string | number> = { ...extra }
  const defaults: FilterState = { ...DEFAULT_FILTERS }
  for (const key of Object.keys(defaults) as Array<keyof FilterState>) {
    if (omit.includes(key)) continue
    patch[key] = filters[key]
  }
  return buildQuery({}, patch)
}
