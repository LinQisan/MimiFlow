import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('article copy falls back when the mobile clipboard API rejects', async () => {
  const [reader, clipboard] = await Promise.all([
    readFile(
      path.join(ROOT, 'modules/reading/components/ArticleReaderClient.tsx'),
      'utf8',
    ),
    readFile(path.join(ROOT, 'modules/reading/components/copy-text.ts'), 'utf8'),
  ])

  assert.match(reader, /await copyText\(textToCopy\)/)
  assert.match(reader, /formatJapaneseTextWithSudachiRubyNotation/)
  assert.match(reader, /formatJapaneseTextWithRubyNotation/)
  assert.match(clipboard, /navigator\.clipboard\?\.writeText/)
  assert.match(clipboard, /catch/)
  assert.match(clipboard, /document\.execCommand\('copy'\)/)
  assert.match(clipboard, /setSelectionRange/)
  assert.match(clipboard, /preventScroll/)
})
