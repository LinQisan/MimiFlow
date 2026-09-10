'use client'

import { useState } from 'react'

export default function VocabularyJsonEditor({ value, onChange, disabled }: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const [message, setMessage] = useState('')
  return (
    <section className='py-4' aria-label='词汇 JSON 编辑'>
      <div className='ui-toolbar flex flex-wrap items-center justify-between gap-3'>
        <label htmlFor='vocabulary-entry-json' className='font-semibold'>词汇结构 JSON</label>
        <div className='flex gap-2'>
          <button type='button' className='ui-btn' disabled={disabled} onClick={async () => {
            try { await navigator.clipboard.writeText(value); setMessage('已复制') }
            catch { setMessage('复制失败，请在编辑框内全选复制') }
          }}>复制 JSON</button>
          <button type='button' className='ui-btn' disabled={disabled} onClick={() => {
            try { onChange(JSON.stringify(JSON.parse(value), null, 2)); setMessage('已格式化') }
            catch { setMessage('JSON 格式有误，请检查引号、逗号和括号') }
          }}>格式化</button>
        </div>
      </div>
      <p id='vocabulary-json-help' className='my-3 text-sm leading-6 text-slate-500'>
        直接修改或粘贴完整 JSON。例句词性填写在 posTags 中，如 <code>{'["名詞"]'}</code> 或 <code>{'["自動詞", "五段動詞"]'}</code>；[] 清除手动词性，阅读时恢复自动判断。
        保留已有 id，新增项目可省略 id。移除项目会在保存时删除对应内容。
      </p>
      <details className='mb-3 text-sm text-slate-500'>
        <summary className='cursor-pointer py-2'>字段填写说明</summary>
        <p className='leading-7'>word：单词；reading：读音；etymologies：词源列表；grammarPartOfSpeech：noun / verb / i_adjective / na_adjective / adverb / adnominal / other；tags：标签。senses：义项；definitions：释义；examples：例句（text 原文、translation 翻译、posTags 词性、source 来源、sourceUrl 来源链接）；patterns：用法；expressions：表达；relations：关联词；notes：备注。</p>
      </details>
      <textarea id='vocabulary-entry-json' aria-describedby='vocabulary-json-help' spellCheck={false}
        value={value} onChange={event => { onChange(event.target.value); setMessage('') }} disabled={disabled}
        className='ui-input min-h-[65vh] w-full resize-y p-4 font-mono text-sm leading-6' />
      <p role='status' className='mt-2 text-sm text-slate-500'>{message}</p>
    </section>
  )
}
