import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

test('reading materials persist uploaded audio and expose playback controls', async () => {
  const [codec, action, editRepository, materialRepository, editor, reader, audioManager] =
    await Promise.all([
      readFile(path.join(ROOT, 'lib/codecs/material-payload.ts'), 'utf8'),
      readFile(path.join(ROOT, 'modules/content/actions/materials.ts'), 'utf8'),
      readFile(path.join(ROOT, 'lib/repositories/collection/manage.ts'), 'utf8'),
      readFile(path.join(ROOT, 'lib/repositories/materials/index.ts'), 'utf8'),
      readFile(path.join(ROOT, 'features/content/ui/EditArticleUI.tsx'), 'utf8'),
      readFile(
        path.join(ROOT, 'app/(library)/reading/articles/[id]/page.tsx'),
        'utf8',
      ),
      readFile(path.join(ROOT, 'features/audio/manage-actions.ts'), 'utf8'),
    ])

  assert.match(codec, /audioFile: z\.string\(\)\.catch\(''\)/)
  assert.match(action, /audioFile\.startsWith\('\/audios\/'\)/)
  assert.match(action, /audioFile,/)
  assert.match(editRepository, /audioFile: readString\(payload\.audioFile\)/)
  assert.match(materialRepository, /audioFile: readString\(payload\.audioFile\)/)
  assert.match(editor, /uploadAudioFileAdmin/)
  assert.match(editor, /上传文章音频/)
  assert.match(editor, /保存文章时上传/)
  assert.match(reader, /article\.audioFile/)
  assert.match(reader, /ManageAudioPlayer/)
  assert.match(audioManager, /MaterialType\.READING/)
  assert.match(audioManager, /linkedReadingMaterials/)
  assert.match(audioManager, /readingRefUpdated/)
})
