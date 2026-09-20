import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { analyze } from '@mimiflow/sudachi'
import * as domain from '../modules/language/domain/sudachi.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sudachi-parity.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../modules/language/server/sudachi-pronunciation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
function loadApi(run = analyze) {
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(id => {
    if (id === 'server-only') return {}
    if (id === '@mimiflow/sudachi') return { analyze: run }
    if (id === '@/modules/language/domain/sudachi') return domain
    return require(id)
  }, loaded, loaded.exports)
  return loaded.exports.getSudachiPronunciationMap
}

test('native output matches the pre-migration Python fixture, including Unicode codepoint offsets and first occurrences', async () => {
  for (const row of fixture.cases) {
    const { timings, ...actual } = await analyze(row.texts)
    assert.deepEqual(actual, row.expected)
    for (const key of ['pronunciationMap', 'lexicon']) assert.deepEqual(Object.keys(actual[key]), Object.keys(row.expected[key]))
    assert.equal(timings.textCount, row.texts.length)
    assert.equal(timings.characterCount, row.texts.reduce((sum, text) => sum + [...text].length, 0))
    assert.equal(timings.tokenCount, row.expected.tokens.length)
  }
})

test('concurrent native requests return independent results without blocking the JS event loop', async () => {
  let ticks = 0
  const timer = setInterval(() => ticks++, 1)
  try {
    const texts = Array.from({ length: 100 }, () => fixture.cases[3].texts).flat()
    const responses = await Promise.all([analyze(texts), analyze(['日本語']), analyze(['交通の便'])])
    assert.ok(ticks > 0)
    assert.equal(responses[0].timings.textCount, texts.length)
    assert.equal(responses[1].tokens[0].surface, '日本語')
    assert.equal(responses[2].tokens[0].surface, '交通')
  } finally { clearInterval(timer) }
})

test('public API keeps whitespace filtering, contextual readings, diagnostic shape and cache reuse', async () => {
  const get = loadApi()
  const empty = await get([' ', '\n'])
  assert.deepEqual(empty, { available: true, pronunciationMap: {}, lexicon: {}, tokens: [] })
  const texts = [' ', '交通の便がいい。郵便の便は別です。', '😀猫']
  const [first, concurrent] = await Promise.all([get(texts), get(texts)])
  assert.equal(first.available, true)
  assert.equal(first, concurrent)
  assert.equal(first, await get(texts))
  assert.equal(first.pronunciationMap['便'], 'べん')
  assert.equal(first.lexicon['便'].reading, 'べん')
  assert.deepEqual(first.tokens.filter(t => t.surface === '便').map(t => t.reading), ['べん', 'びん'])
  assert.equal(first.tokens.find(t => t.surface === '猫').textIndex, 1)
  assert.equal(first.tokens.find(t => t.surface === '猫').begin, 1)
  assert.deepEqual(Object.keys(first.timing).sort(), ['mode', 'inputSerializationMs', 'spawnMs', 'inputWriteMs', 'firstOutputMs', 'outputReadMs', 'processWallMs', 'jsonParseMs', 'workerQueueMs', 'workerReadyMs', 'python'].sort())
  for (const key of ['inputSerializationMs', 'spawnMs', 'inputWriteMs', 'jsonParseMs']) assert.equal(first.timing[key], 0)
})

test('failed analysis is not cached and does not poison subsequent requests', async () => {
  let calls = 0
  const get = loadApi(async () => {
    if (++calls <= 2) throw new Error('unavailable native dictionary')
    return { pronunciationMap: {}, lexicon: {}, tokens: [] }
  })
  assert.equal((await get(['test'])).available, false)
  assert.equal((await get(['test'])).available, true)
  assert.equal(calls, 3)
})

test('public cache remains bounded to 100 completed requests', async () => {
  let calls = 0
  const get = loadApi(async () => { calls++; return { pronunciationMap: {}, lexicon: {}, tokens: [] } })
  for (let i = 0; i < 101; i++) await get([`text-${i}`])
  await get(['text-100'])
  assert.equal(calls, 101)
  await get(['text-0'])
  assert.equal(calls, 102)
})

test('an oversized individual input fails safely and the native dictionary remains usable', async () => {
  await assert.rejects(analyze(['猫'.repeat(100_000)]))
  assert.equal((await analyze(['猫'])).pronunciationMap['猫'], 'ねこ')
})


test('a transient native initialization failure is retried once', async () => {
  let calls = 0
  const get = loadApi(async () => {
    if (++calls === 1) throw new Error('transient initialization failure')
    return { pronunciationMap: {}, lexicon: {}, tokens: [] }
  })
  assert.equal((await get(['retry'])).available, true)
  assert.equal(calls, 2)
})

test('queued requests time out without running stale analysis', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let release
  const gate = new Promise(resolve => { release = resolve })
  let calls = 0
  const get = loadApi(async () => {
    if (++calls === 1) await gate
    return { pronunciationMap: {}, lexicon: {}, tokens: [] }
  })
  const first = get(['slow'])
  const waiting = get(['queued'])
  await Promise.resolve()
  t.mock.timers.tick(15_001)
  assert.equal((await first).available, false)
  assert.equal((await waiting).available, false)
  release()
  assert.equal((await get(['next'])).available, true)
  assert.equal(calls, 2)
})
