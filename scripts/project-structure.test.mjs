import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const sourceDirs = ['app', 'components', 'hooks', 'lib', 'modules', 'utils']

async function* sourceFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(file)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield file
  }
}

test('source boundaries keep persistence and shared domains out of UI modules', async () => {
  const violations = []
  for (const directory of sourceDirs) {
    for await (const file of sourceFiles(path.join(root, directory))) {
      const relative = path.relative(root, file)
      const content = await readFile(file, 'utf8')

      if (/^(app|components)\/.+\.tsx$/.test(relative) && /(?:@\/lib\/prisma|\bprisma\.)/.test(content)) {
        violations.push(`${relative} -> direct Prisma access`)
      }
      if (relative !== 'app/layout.tsx' && /from\s+['"]@\/app\//.test(content)) {
        violations.push(`${relative} -> route-to-route import`)
      }
      if (/\b(?:asRecord|asString|asBoolean|asFiniteNumber)\b/.test(content)) {
        violations.push(`${relative} -> legacy unknown-value coercion`)
      }
      if (/\b(?:toLegacyMaterialId|toMaterialId|legacyId|ByLegacyId)\b|endsWith:\s*`?:/.test(content)) {
        violations.push(`${relative} -> legacy material ID path`)
      }
      if (/readJsonRecord\([^\n]*contentPayload/.test(content)) {
        violations.push(`${relative} -> material payload bypasses codec`)
      }
      if (content.includes('components/questions/domain') || content.includes('/api/practice/pronunciation') || content.includes('modules/reading/domain/sudachi') || content.includes('modules/reading/components/PronunciationSourceSelector')) {
        violations.push(`${relative} -> duplicated shared domain`)
      }
      if (/(^|\s)import\s[^;]*@\/features\//m.test(content) || /from\s+['"]@\/features\//.test(content)) {
        violations.push(`${relative} -> retired features dependency`)
      }
    }
  }
  assert.deepEqual(violations, [])
})
