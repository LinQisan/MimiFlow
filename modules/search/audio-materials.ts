import { decodeMaterialPayload } from '../../lib/codecs/material-payload.ts'

export function getAudioSearchFields(type: 'LISTENING' | 'SPEAKING', value: unknown) {
  const payload = decodeMaterialPayload(type, value)
  return [payload.description || '', payload.transcript || '', ...payload.dialogues.flatMap(line => [line.text, line.note])]
}

export function audioSearchSnippet(fields: string[], tokens: string[], max = 120) {
  const token = tokens.find(token => fields.some(field => field.toLowerCase().includes(token.toLowerCase())))
  const field = (token && fields.find(field => field.toLowerCase().includes(token.toLowerCase()))) || fields.find(Boolean) || ''
  const match = token ? field.toLowerCase().indexOf(token.toLowerCase()) : 0
  const start = Math.max(0, match - 30)
  return `${start ? '…' : ''}${field.slice(start, start + max)}${field.length > start + max ? '…' : ''}`
}
