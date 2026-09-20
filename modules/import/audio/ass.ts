export type RawAssSubtitle = {
  id: number
  text: string
  rawStart: number
  rawEnd: number
}

export type RawSubtitle = RawAssSubtitle

export type TimelineDialogue = {
  id: number
  text: string
  start: number
  end: number
  sequenceId: number
}

function subtitleTimeToSeconds(timeText: string): number {
  const match = timeText
    .trim()
    .match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/)
  if (!match) return Number.NaN

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(fraction)
  ) {
    return Number.NaN
  }

  return hours * 3600 + minutes * 60 + seconds + fraction
}

function splitAssRow(row: string, splitLimit: number) {
  const parts: string[] = []
  let cursor = 0
  for (let index = 0; index < splitLimit - 1; index += 1) {
    const commaIndex = row.indexOf(',', cursor)
    if (commaIndex === -1) break
    parts.push(row.slice(cursor, commaIndex))
    cursor = commaIndex + 1
  }
  parts.push(row.slice(cursor))
  return parts
}

function splitDialogueTextToLines(text: string) {
  return text
    .replace(/\\N|\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

export function parseAssToRawSubtitles(assContent: string): RawAssSubtitle[] {
  const subtitles: RawAssSubtitle[] = []
  const lines = assContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  let eventsStarted = false
  let dialogueId = 1
  let formatFields: string[] = []
  let startIndex = 1
  let endIndex = 2
  let textIndex = 9

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^\[events\]$/i.test(line)) {
      eventsStarted = true
      continue
    }
    if (!eventsStarted) continue
    if (/^format:/i.test(line)) {
      formatFields = line
        .replace(/^format:/i, '')
        .split(',')
        .map(item => item.trim().toLowerCase())
      const nextStartIndex = formatFields.indexOf('start')
      const nextEndIndex = formatFields.indexOf('end')
      const nextTextIndex = formatFields.indexOf('text')
      if (nextStartIndex >= 0) startIndex = nextStartIndex
      if (nextEndIndex >= 0) endIndex = nextEndIndex
      if (nextTextIndex >= 0) textIndex = nextTextIndex
      continue
    }
    if (!/^dialogue:/i.test(line)) continue

    const row = line.replace(/^dialogue:/i, '').trim()
    const splitLimit =
      formatFields.length > 0 ? formatFields.length : textIndex + 1
    const parts = splitAssRow(row, splitLimit)
    if (parts.length <= Math.max(startIndex, endIndex, textIndex)) continue

    const rawStart = subtitleTimeToSeconds(parts[startIndex])
    const rawEnd = subtitleTimeToSeconds(parts[endIndex])
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    if (rawEnd <= rawStart) continue

    for (const text of splitDialogueTextToLines(parts[textIndex])) {
      subtitles.push({ id: dialogueId, text, rawStart, rawEnd })
      dialogueId += 1
    }
  }

  return subtitles.sort(
    (left, right) => left.rawStart - right.rawStart || left.rawEnd - right.rawEnd,
  )
}

function splitSrtTextToLines(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.replace(/<[^>]+>/g, ''))
    .map(item => item.trim())
    .filter(Boolean)
}

export function parseSrtToRawSubtitles(srtContent: string): RawSubtitle[] {
  const subtitles: RawSubtitle[] = []
  const blocks = srtContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
  let subtitleId = 1

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
    const timingIndex = lines.findIndex(line => line.includes('-->'))
    if (timingIndex < 0) continue

    const timing = lines[timingIndex].match(
      /^(\d+:[^\s]+)\s*-->\s*(\d+:[^\s]+)/,
    )
    if (!timing) continue

    const rawStart = subtitleTimeToSeconds(timing[1])
    const rawEnd = subtitleTimeToSeconds(timing[2])
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    if (rawEnd <= rawStart) continue

    for (const text of splitSrtTextToLines(lines.slice(timingIndex + 1).join('\n'))) {
      subtitles.push({
        id: subtitleId,
        text,
        rawStart,
        rawEnd,
      })
      subtitleId += 1
    }
  }

  return subtitles.sort(
    (left, right) => left.rawStart - right.rawStart || left.rawEnd - right.rawEnd,
  )
}

export function parseSubtitleToRawSubtitles(
  content: string,
  extension: string,
): RawSubtitle[] {
  const normalizedExtension = extension.trim().toLowerCase()
  return normalizedExtension === '.srt'
    ? parseSrtToRawSubtitles(content)
    : parseAssToRawSubtitles(content)
}

/**
 * Convert parsed subtitle timestamps without any timeline business rules.
 * Re-importing a subtitle file must use this path so padding, gap filling,
 * overlap repair, and audio-based alignment cannot change the source times.
 */
export function convertRawSubtitlesToTimeline(
  subtitles: readonly RawSubtitle[],
): TimelineDialogue[] {
  return subtitles.map((subtitle, index) => ({
    id: index + 1,
    text: subtitle.text,
    start: subtitle.rawStart,
    end: subtitle.rawEnd,
    sequenceId: index + 1,
  }))
}

export function applyAssTimelinePadding(
  subtitles: RawAssSubtitle[],
  padStart = 0.1,
  padEnd = 0.3,
  minGap = 0.05,
): TimelineDialogue[] {
  const minDuration = 0.05
  const result: TimelineDialogue[] = []

  for (let index = 0; index < subtitles.length; index += 1) {
    const subtitle = subtitles[index]
    let actualPadStart = padStart
    let actualPadEnd = padEnd

    if (index > 0) {
      const availableSpace = subtitle.rawStart - result[index - 1].end - minGap
      actualPadStart =
        availableSpace < 0 ? 0 : Math.min(padStart, availableSpace)
    }
    if (index < subtitles.length - 1) {
      const availableSpace =
        subtitles[index + 1].rawStart - subtitle.rawEnd - minGap
      actualPadEnd = availableSpace < 0 ? 0 : Math.min(padEnd, availableSpace)
    }

    const start = Math.max(0, subtitle.rawStart - actualPadStart)
    const end = Math.max(start + minDuration, subtitle.rawEnd + actualPadEnd)
    result.push({
      id: index + 1,
      text: subtitle.text,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      sequenceId: index + 1,
    })
  }

  return result
}

function secondsToAssTime(value: number) {
  const totalCentiseconds = Math.max(0, Math.round(value * 100))
  const hours = Math.floor(totalCentiseconds / 360000)
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000)
  const seconds = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

function escapeAssText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\N')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
}

export function serializeTimelineToAss(
  dialogues: Array<Pick<TimelineDialogue, 'text' | 'start' | 'end'>>,
  title = 'MimiFlow Timeline',
) {
  const safeTitle = title.replace(/[\r\n]+/g, ' ').trim() || 'MimiFlow Timeline'
  const header = `[Script Info]
Title: ${safeTitle}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
  const events = dialogues.map(dialogue =>
    `Dialogue: 0,${secondsToAssTime(dialogue.start)},${secondsToAssTime(dialogue.end)},Default,,0,0,0,,${escapeAssText(dialogue.text)}`,
  )
  return `${header}\n${events.join('\n')}\n`
}
