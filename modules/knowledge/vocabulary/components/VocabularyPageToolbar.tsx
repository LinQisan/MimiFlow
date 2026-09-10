type VocabularyPageToolbarProps = {
  languages: Array<{ name: string; label: string; count: number }>
  activeLanguage: string
  viewMode: 'list' | 'flashcard'
  editing: boolean
  onLanguageChange: (name: string) => void
  onViewChange: (mode: 'list' | 'flashcard') => void
  onEditingChange: () => void
}

export default function VocabularyPageToolbar({
  languages,
  activeLanguage,
  viewMode,
  editing,
  onLanguageChange,
  onViewChange,
  onEditingChange,
}: VocabularyPageToolbarProps) {
  return (
    <div
      aria-label='词汇页面工具栏'
      role='group'
      className='vocab-topbar flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 py-1'>
      <nav
        aria-label='词汇语言'
        className='vocab-language-tabs flex min-w-0 max-w-full items-center gap-5 overflow-x-auto'>
        {languages.map(({ name, label, count }) => (
          <button
            key={name}
            type='button'
            aria-current={activeLanguage === name ? 'page' : undefined}
            onClick={() => onLanguageChange(name)}
            className={`vocab-language-tab min-h-10 shrink-0 px-0.5 py-2 text-sm font-semibold transition-colors ${
              activeLanguage === name
                ? 'text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
            }`}>
            {label}
            <span className='vocab-language-count ml-1 tabular-nums opacity-75'>
              ({count})
            </span>
          </button>
        ))}
      </nav>
      <div
        role='group'
        aria-label='视图操作'
        className='vocab-view-actions flex shrink-0 items-center gap-2'>
        <div className='vocab-view-selector inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5'>
          {(
            [
              { mode: 'list', label: '列表' },
              { mode: 'flashcard', label: '单词卡' },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              type='button'
              aria-pressed={viewMode === mode}
              onClick={() => onViewChange(mode)}
              className={`vocab-view-option min-h-10 rounded-sm px-3 py-1.5 text-sm font-bold transition-colors ${
                viewMode === mode
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button
          type='button'
          aria-pressed={editing}
          onClick={onEditingChange}
          className={`vocab-edit-button inline-flex min-h-10 shrink-0 items-center whitespace-nowrap px-2 text-xs font-medium transition-colors ${
            editing
              ? 'text-slate-900 underline decoration-slate-300 underline-offset-4'
              : 'text-slate-500 hover:text-slate-900'
          }`}>
          {viewMode === 'flashcard' ? '编辑' : '管理'}
        </button>
      </div>
    </div>
  )
}
