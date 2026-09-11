import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

// Layer rule: routes compose domain modules, which depend on shared lib/utils.
// Business code no longer has a parallel features/ tree.

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

test('source code has no retired features/ imports', async () => {
  const files = [
    ...(await sourceFiles('app')),
    ...(await sourceFiles('components')),
    ...(await sourceFiles('modules')),
  ]
  const violations = []
  for (const file of files) {
    const relative = path.relative(ROOT, file)
    const content = await readFile(file, 'utf8')
    if (/(^|\s)import\s[^;]*@\/features\//m.test(content) || /from\s+['"]@\/features\//.test(content)) {
      violations.push(`${relative} -> retired features dependency`)
    }
  }
  assert.deepEqual(violations, [])
})
