import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as questionText from '../modules/practice/domain/question-text.ts'
import * as sorting from '../modules/questions/domain/sorting.ts'

const require = createRequire(import.meta.url)
function loadComponent(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    id => dependencies[id] || require(id), loaded, loaded.exports,
  )
  return loaded.exports
}
const { SortingResult } = loadComponent('../modules/questions/components/question-renderer/SortingResult.tsx', {
  '@/modules/practice/domain/question-text': questionText,
  '@/modules/questions/domain/sorting': sorting,
  './annotate': { annotateExamText: ({ text }) => text },
  './SortingResult.module.css': { default: new Proxy({}, { get: (_, key) => key }), __esModule: true },
})
const NoteEditor = loadComponent('../modules/questions/components/QuestionNoteEditor.tsx', {
  '@/modules/practice/actions/questions': { updateQuestionNote: () => { throw new Error('Unexpected write') } },
}).default
const options = [
  { id: 'a', text: 'こそ' }, { id: 'b', text: 'しなかった' },
  { id: 'c', text: 'が' }, { id: 'd', text: '午前中' },
]
const question = {
  id: 'question-1', prompt: '積もり[[sort]][[sort:star]][[sort]][[sort]]ずっと雪が降っていた。',
  options, correctOrder: ['a', 'b', 'c', 'd'],
}
const render = (selectedSlots, overrides = {}) => renderToStaticMarkup(createElement(SortingResult, {
  question: { ...question, ...overrides }, selectedSlots, annotation: {}, isJapanesePaper: true,
}))

test('review renders a complete selectable sentence and emphasizes only displaced words', () => {
  const html = render([options[0], options[3], options[2], options[1]])
  assert.match(html, /data-context-sentence="true"[^>]*>積もりこそしなかったが午前中ずっと雪が降っていた。<\/p>/)
  assert.match(html, /data-source-id="question-1"/)
  assert.equal((html.match(/class="[^"]*misplaced/g) || []).length, 2)
  assert.equal((html.match(/class="[^"]*corrected/g) || []).length, 2)
  assert.equal((html.match(/class="[^"]*unchanged/g) || []).length, 4)
  assert.doesNotMatch(html, /★|<button|disabled|\[\[sort/)
})

test('a fully correct order shows the sentence without a redundant comparison', () => {
  const html = render(options)
  assert.match(html, /你的排列与正确顺序一致/)
  assert.doesNotMatch(html, /<table/)
})

test('legacy partial answers remain visibly unanswered instead of appearing correct', () => {
  const html = render([null, options[1], null, null])
  assert.equal((html.match(/未作答/g) || []).length, 3)
  assert.match(html, /積もりこそしなかったが午前中ずっと雪が降っていた。/)
})

test('missing answer configuration does not fabricate a complete sentence', () => {
  const html = render(options, { correctOrder: [] })
  assert.match(html, /完整正确句子暂未配置/)
  assert.doesNotMatch(html, /data-context-sentence|<table/)
})

test('empty notes start collapsed while saved notes remain visible', () => {
  const empty = renderToStaticMarkup(createElement(NoteEditor, { questionId: 'q', initialNote: '  ' }))
  assert.match(empty, /＋ 添加本题笔记/)
  assert.doesNotMatch(empty, /<textarea|保存笔记/)
  const saved = renderToStaticMarkup(createElement(NoteEditor, { questionId: 'q', initialNote: '记住句型' }))
  assert.match(saved, /记住句型/)
  assert.match(saved, /编辑/)
  assert.doesNotMatch(saved, /添加本题笔记|<textarea/)
})
