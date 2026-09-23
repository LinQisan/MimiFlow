export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.webm',
])

export function toSafeFilename(name: string) {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
}

export function getDatedAudioFolder(prefix: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value || 'unknown'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  return `${prefix}/${year}-${month}`
}
