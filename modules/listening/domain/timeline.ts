export const MIN_TIMELINE_DURATION = 0.05

export type TimelineRange = {
  start: number
  end: number
}

export type TimelineValidationOptions = TimelineRange & {
  audioDuration?: number
}

/**
 * Validate the bounds needed for playback. A short draft can still be
 * auditioned so an editor can hear a cut point; the minimum-duration rule is
 * enforced separately by getTimelineRangeError before persistence.
 */
export function getTimelinePlaybackRangeError({
  start,
  end,
  audioDuration,
}: TimelineValidationOptions): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return '请输入有效的开始和结束时间。'
  }
  if (start < 0) return '开始时间不能小于 0。'
  if (end < 0) return '结束时间不能小于 0。'
  if (Number.isFinite(audioDuration) && end > (audioDuration as number)) {
    return `结束时间不能超过音频长度 ${audioDuration?.toFixed(3)} 秒。`
  }
  if (start >= end) return '开始时间必须早于结束时间。'
  return null
}

/**
 * Return a user-facing validation message for a timeline range.
 * `audioDuration` is optional because the browser may not have loaded the
 * media metadata yet. The client supplies it once it is known; the server
 * enforces the range and minimum-duration invariants and validates a supplied
 * duration bound.
 */
export function getTimelineRangeError({
  start,
  end,
  audioDuration,
}: TimelineValidationOptions): string | null {
  const playbackError = getTimelinePlaybackRangeError({
    start,
    end,
    audioDuration,
  })
  if (playbackError) return playbackError
  if (end - start < MIN_TIMELINE_DURATION) {
    return `片段长度至少为 ${MIN_TIMELINE_DURATION.toFixed(2)} 秒。`
  }
  return null
}

/**
 * Update one dialogue without changing the order or any other authored data.
 */
export function updateDialogueTimelineAtIndex<
  T extends { start: number; end: number },
>(dialogues: readonly T[], index: number, range: TimelineRange): T[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= dialogues.length) {
    return null
  }

  return dialogues.map((dialogue, dialogueIndex) =>
    dialogueIndex === index
      ? { ...dialogue, start: range.start, end: range.end }
      : dialogue,
  )
}

/**
 * Update a dialogue by its persisted stable id. Array positions are only a
 * presentation detail: they can change after sorting or importing subtitles.
 */
export function updateDialogueTimelineAtId<
  T extends { stableId: string; start: number; end: number },
>(
  dialogues: readonly T[],
  stableId: string,
  range: TimelineRange,
): T[] | null {
  if (!stableId.trim()) return null
  let found = false
  const updated = dialogues.map(dialogue => {
    if (dialogue.stableId !== stableId) return dialogue
    found = true
    return { ...dialogue, start: range.start, end: range.end }
  })
  return found ? updated : null
}

export type TimelineOverlapWarnings = {
  previous: number
  next: number
}

function roundTimelineValue(value: number) {
  return Number(value.toFixed(3))
}

export function getTimelineOverlapWarnings(
  dialogues: readonly TimelineRange[],
  index: number,
  range: TimelineRange,
): TimelineOverlapWarnings {
  const previous = dialogues[index - 1]
  const next = dialogues[index + 1]

  return {
    previous:
      previous && range.start < previous.end
        ? roundTimelineValue(previous.end - range.start)
        : 0,
    next:
      next && range.end > next.start
        ? roundTimelineValue(range.end - next.start)
        : 0,
  }
}

export function getTimelineOverlapWarningsAtId<
  T extends TimelineRange & { stableId: string },
>(
  dialogues: readonly T[],
  stableId: string,
  range: TimelineRange,
): TimelineOverlapWarnings {
  const index = dialogues.findIndex(dialogue => dialogue.stableId === stableId)
  if (index < 0) return { previous: 0, next: 0 }
  return getTimelineOverlapWarnings(dialogues, index, range)
}
