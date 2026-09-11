import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../modules/knowledge/vocabulary/components/VocabularyRefreshOnReturn.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const harness = () => {
  const window = new EventTarget()
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  let refreshes = 0
  let cleanup
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, window, document,
    require: name => {
      if (name === 'react') return { useEffect: effect => { cleanup = effect() } }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh: () => { refreshes++ } }) }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  exports.default()
  return { window, document, count: () => refreshes, cleanup: () => cleanup() }
}

test('returning to a hidden vocabulary tab refreshes once for visibility and focus', () => {
  const h = harness()
  assert.equal(h.count(), 0, 'mount does not repeat the server read')
  h.document.visibilityState = 'hidden'
  h.document.dispatchEvent(new Event('visibilitychange'))
  h.window.dispatchEvent(new Event('blur'))
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.count(), 0, 'hidden tabs do not fetch')
  h.document.visibilityState = 'visible'
  h.document.dispatchEvent(new Event('visibilitychange'))
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.count(), 1)
  h.cleanup()
  h.window.dispatchEvent(new Event('blur'))
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.count(), 1, 'unmounted pages do not fetch')
})

test('returning from a separate admin window refreshes the visible vocabulary page', () => {
  const h = harness()
  h.window.dispatchEvent(new Event('blur'))
  h.window.dispatchEvent(new Event('focus'))
  h.window.dispatchEvent(new Event('focus'))
  assert.equal(h.count(), 1)
  h.cleanup()
})
