import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

// Layer rule: app -> features -> modules -> lib/utils.
// modules/ must not gain NEW runtime dependencies on features/.
// The five entries below are grandfathered with reasons; any other
// modules/ file importing @/features/ fails this test.
const ALLOWLIST = new Map([
  [
    'modules/media-subtitles/hooks/useMediaSubtitleMutations.ts',
    'client-hook passthrough over features/subtitles actions (UI composition)',
  ],
  [
    'modules/import/types.ts',
    'type-only import of news metadata kinds (erased at build)',
  ],
  [
    'modules/import/components/ArticleImportPanel.tsx',
    'import-panel UI reusing reading domain parsers and preview (UI composition)',
  ],
  [
    'modules/content/actions/materials.ts',
    'paper attributes + vocabulary analytics invalidation (deferred: 9 call sites)',
  ],
  [
    'modules/practice/actions/questions.ts',
    'vocabulary analytics invalidation (deferred: shared cache helper move)',
  ],
])

const ROOT = process.cwd()

async function sourceFiles(directory) {
  const absolute = path.join(ROOT, directory)
  const entries = await readdir(absolute)
  const files = []
  for (const entry of entries) {
    const target = path.join(absolute, entry)
    const info = await stat(target)
    if (info.isDirectory()) {
      files.push(...(await sourceFiles(path.relative(ROOT, target))))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(target)
    }
  }
  return files
}

test('modules/ gains no new dependencies on features/', async () => {
  const files = await sourceFiles('modules')
  const violations = []
  for (const file of files) {
    const relative = path.relative(ROOT, file)
    const content = await readFile(file, 'utf8')
    if (/(^|\s)import\s[^;]*@\/features\//m.test(content) || /from\s+['"]@\/features\//.test(content)) {
      if (!ALLOWLIST.has(relative)) {
        violations.push(`${relative} -> new modules-to-features dependency`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('allowlisted modules-to-features dependencies are still the known ones', async () => {
  for (const [relative, reason] of ALLOWLIST) {
    const content = await readFile(path.join(ROOT, relative), 'utf8')
    assert.match(content, /@\/features\//, `${relative} (${reason})`)
  }
})
