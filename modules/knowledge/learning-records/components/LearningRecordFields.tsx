'use client'

import { LearningPointCategory, LearningRecordKind } from '@prisma/client'
import CustomSelect from '@/components/ui/CustomSelect'
import { LEARNING_POINT_CATEGORY_LABELS } from '../domain'

export type LearningRecordDraft = {
  title: string
  category: LearningPointCategory
  fragments: string
  sentenceText: string
  note: string
}

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const labelClass = 'block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300'

/** The same record definition is edited from selection and the record library. */
export default function LearningRecordFields({ kind, value, onChange }: {
  kind: LearningRecordKind
  value: LearningRecordDraft
  onChange: (value: LearningRecordDraft) => void
}) {
  const patch = (next: Partial<LearningRecordDraft>) => onChange({ ...value, ...next })
  return <div className='space-y-4'>
    <label className={labelClass}>
      <span>{kind === LearningRecordKind.SENTENCE ? '句子标题' : '学习点名称'}</span>
      <input autoFocus value={value.title} onChange={event => patch({ title: event.target.value })} className={fieldClass} />
    </label>
    {kind === LearningRecordKind.LEARNING_POINT ? <>
      <label className={labelClass}>
        <span>类型</span>
        <CustomSelect value={value.category} onChange={event => patch({ category: event.target.value as LearningPointCategory })}>
          {Object.values(LearningPointCategory).map(category => <option key={category} value={category}>{LEARNING_POINT_CATEGORY_LABELS[category]}</option>)}
        </CustomSelect>
      </label>
      <label className={labelClass}>
        <span>句内片段</span>
        <textarea rows={2} value={value.fragments} onChange={event => patch({ fragments: event.target.value })} className={fieldClass} placeholder='每行一个片段' />
      </label>
    </> : null}
    <label className={labelClass}>
      <span>原句</span>
      <textarea lang='ja' rows={3} value={value.sentenceText} onChange={event => patch({ sentenceText: event.target.value })} className={`${fieldClass} font-reading-body-ja`} />
    </label>
    <label className={labelClass}>
      <span>笔记 / 释义</span>
      <textarea rows={4} value={value.note} onChange={event => patch({ note: event.target.value })} className={fieldClass} placeholder='含义、语感、句子结构或易错点' />
    </label>
  </div>
}
