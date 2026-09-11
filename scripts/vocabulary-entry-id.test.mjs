import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

test('vocabulary draft normalization does not create random IDs during render', async () => {
  const editor = await readFile(
    path.join(
      ROOT,
      'modules/knowledge/vocabulary/components/VocabularyEntryEditor.tsx',
    ),
    'utf8',
  )
  const normalizationStart = editor.indexOf('function toVocabularyEntryDraft')
  const normalizationEnd = editor.indexOf('const draftRelation')
  assert.ok(normalizationStart >= 0)
  assert.ok(normalizationEnd > normalizationStart)
  const normalization = editor.slice(normalizationStart, normalizationEnd)

  assert.doesNotMatch(normalization, /makeVocabularyClientId|randomUUID|Math\.random/)
  assert.doesNotMatch(normalization, /makeLegacyDraftId/)
  assert.match(normalization, /id: example.id!/)
  assert.match(editor, /typeof cryptoApi\?\.randomUUID === 'function'/)
  assert.match(editor, /typeof cryptoApi\?\.getRandomValues === 'function'/)
  assert.doesNotMatch(editor, /const makeId\s*=/)
})

test('inline example creation uses the event-time ID helper', async () => {
  const tabs = await readFile(
    path.join(ROOT, 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
    'utf8',
  )

  assert.doesNotMatch(tabs, /crypto\.randomUUID\(\)/)
  assert.match(tabs, /id: makeVocabularyClientId\('inline-example'\)/)
  assert.match(tabs, /sentence\.id \|\| makeVocabularyClientId\('inline-example'\)/)
})
