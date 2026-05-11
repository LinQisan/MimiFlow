export function formatMediaTime(
  seconds: number,
  options: { fractionalDigits?: number } = {},
) {
  const fractionalDigits = options.fractionalDigits ?? 0
  if (!Number.isFinite(seconds)) {
    return fractionalDigits > 0
      ? `00:00.${'0'.repeat(fractionalDigits)}`
      : '00:00'
  }

  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remaining = safe - minutes * 60

  if (fractionalDigits > 0) {
    return `${String(minutes).padStart(2, '0')}:${remaining
      .toFixed(fractionalDigits)
      .padStart(3 + fractionalDigits, '0')}`
  }

  const total = Math.floor(safe)
  const wholeMinutes = Math.floor(total / 60)
  const wholeSeconds = total % 60
  return `${String(wholeMinutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`
}

export function formatDurationCompact(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  const sec = safe % 60

  if (day > 0) {
    if (hour > 0) return `${day}天 ${hour}小时`
    return `${day}天 ${minute}分钟`
  }
  if (hour > 0) return `${hour}小时 ${minute}分钟`
  if (minute > 0) return `${minute}分钟`
  return `${sec}秒`
}

export function formatTokyoDateTime(value: Date | string | null | undefined) {
  if (!value) return '无'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
