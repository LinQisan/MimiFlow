import { performance } from 'node:perf_hooks'
import { readFile } from 'node:fs/promises'
import { analyze } from '@mimiflow/sudachi'

const fixture = JSON.parse(await readFile(new URL('./fixtures/sudachi-parity.json', import.meta.url), 'utf8'))
const texts = fixture.cases[3].texts
const results = []
for (let iteration = 0; iteration < 6; iteration++) {
  const start = performance.now()
  const result = await analyze(texts)
  results.push({ iteration, wallMs: Math.round((performance.now() - start) * 10) / 10, tokens: result.tokens.length })
}
console.log(JSON.stringify({ engine: 'sudachi.rs 0.6.11 / Node-API', dictionary: fixture.dictionary, texts: texts.length, results }, null, 2))
