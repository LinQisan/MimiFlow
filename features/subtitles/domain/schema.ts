export {
  mediaSubtitlePayloadSchema as subtitlePayloadSchema,
} from '@/lib/codecs/material-payload'

import type { MaterialPayload } from '@/lib/codecs/material-payload'

export type SubtitlePayload = MaterialPayload<'MEDIA_SUBTITLE'>
