export {
  materialDialogueSchema as subtitleDialogueSchema,
  mediaSubtitlePayloadSchema as subtitlePayloadSchema,
  type MaterialPayload as SubtitlePayloadByType,
} from '@/lib/codecs/material-payload'

export type { MaterialPayloadEnvelope } from '@/lib/codecs/material-payload'

import type { MaterialPayload } from '@/lib/codecs/material-payload'

export type SubtitlePayload = MaterialPayload<'MEDIA_SUBTITLE'>
