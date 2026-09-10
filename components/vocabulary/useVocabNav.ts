'use client'

import { useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DEFAULT_FILTERS, buildQuery, parseFilters } from './filters'
import type { FilterState } from './types'

const FILTER_KEYS: Array<keyof Omit<FilterState, 'page'>> = [
  'lang',
  'q',
  'sort',
  'pos',
  'tag',
  'book',
]

/** URL 即状态：读 useSearchParams，写 router.replace；筛选变化自动回第 1 页 */
export function useVocabNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const filters = useMemo(() => {
    const raw: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      raw[key] = value
    })
    return parseFilters(raw)
  }, [searchParams])

  const current = useMemo(() => {
    const raw: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      raw[key] = value
    })
    return raw
  }, [searchParams])

  const update = (patch: Partial<FilterState>) => {
    const resetsPage = FILTER_KEYS.some(key => patch[key] !== undefined)
    const merged: Record<string, string | number> = { ...patch }
    if (resetsPage) merged.page = 1
    startTransition(() => {
      router.replace(`${pathname}${buildQuery(current, merged)}`, { scroll: false })
    })
  }

  const reset = () => {
    startTransition(() => {
      router.replace(
        `${pathname}${buildQuery(current, { ...DEFAULT_FILTERS, lang: filters.lang, page: 1 })}`,
        { scroll: false },
      )
    })
  }

  return { filters, update, reset, isPending }
}
