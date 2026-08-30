import 'server-only'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

export const PUBLIC_ROOT = path.resolve(MODULE_DIRECTORY, '../../public')

export const PUBLIC_AUDIO_ROOT = path.join(PUBLIC_ROOT, 'audios')

export const PUBLIC_QUESTION_IMAGE_ROOT = path.join(
  PUBLIC_ROOT,
  'images',
  'questions',
)
