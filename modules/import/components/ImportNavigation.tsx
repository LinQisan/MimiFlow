'use client'

import { useRouter } from 'next/navigation'

import CustomSelect from '@/components/ui/CustomSelect'

type NavigationItem = {
  type: string
  label: string
  enabled: boolean
}

type NavigationGroup = {
  scope: string
  label: string
  items: NavigationItem[]
}

type Props = {
  languages: Array<{ value: string; label: string }>
  groups: NavigationGroup[]
  language: string
  activeScope: string
  activeType: string
}

export default function ImportNavigation({
  languages,
  groups,
  language,
  activeScope,
  activeType,
}: Props) {
  const router = useRouter()
  const availableGroups = groups.filter(group =>
    group.items.some(item => item.enabled),
  )
  const activeGroup =
    availableGroups.find(group => group.scope === activeScope) ??
    availableGroups[0]
  const availableItems = activeGroup?.items.filter(item => item.enabled) ?? []

  const navigate = (nextLanguage: string, scope: string, type: string) => {
    const params = new URLSearchParams({
      language: nextLanguage,
      scope,
      type,
    })
    router.push(`/manage/import?${params.toString()}`)
  }

  const handleLanguageChange = (nextLanguage: string) => {
    navigate(
      nextLanguage,
      'paper',
      'listening',
    )
  }

  const handleScopeChange = (nextScope: string) => {
    const group = availableGroups.find(item => item.scope === nextScope)
    const firstItem = group?.items.find(item => item.enabled)
    if (firstItem) navigate(language, nextScope, firstItem.type)
  }

  return (
    <aside className='min-w-0 lg:sticky lg:top-24 lg:self-start'>
      <div className='py-5'>
        <p className='text-xs font-bold uppercase tracking-[0.16em] text-slate-400'>Import</p>
        <h2 className='mt-2 text-lg font-semibold text-slate-950'>导入内容</h2>

        <div className='mt-5 space-y-4'>
          <label className='block'>
            <span className='mb-2 block text-xs font-bold text-slate-500'>语言</span>
            <CustomSelect
              value={language}
              onChange={event => handleLanguageChange(event.currentTarget.value)}
              aria-label='选择导入语言'
              className='ui-input !h-10 text-left text-sm font-semibold'>
              {languages.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </CustomSelect>
          </label>

          <label className='block'>
            <span className='mb-2 block text-xs font-bold text-slate-500'>分类</span>
            <CustomSelect
              value={activeGroup?.scope ?? ''}
              onChange={event => handleScopeChange(event.currentTarget.value)}
              aria-label='选择导入分类'
              className='ui-input !h-10 text-left text-sm font-semibold'>
              {availableGroups.map(group => (
                <option key={group.scope} value={group.scope}>
                  {group.label}
                </option>
              ))}
            </CustomSelect>
          </label>

          <label className='block'>
            <span className='mb-2 block text-xs font-bold text-slate-500'>类型</span>
            <CustomSelect
              value={activeType}
              onChange={event =>
                navigate(
                  language,
                  activeGroup?.scope ?? activeScope,
                  event.currentTarget.value,
                )
              }
              aria-label='选择导入类型'
              className='ui-input !h-10 text-left text-sm font-semibold'>
              {availableItems.map(item => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </CustomSelect>
          </label>
        </div>
      </div>
    </aside>
  )
}
