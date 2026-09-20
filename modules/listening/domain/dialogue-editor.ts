export function updateDialogueTextAtIndex<T extends { text: string }>(
  dialogues: T[],
  index: number,
  text: string,
): T[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= dialogues.length) {
    return null
  }
  return dialogues.map((dialogue, dialogueIndex) =>
    dialogueIndex === index ? { ...dialogue, text } : dialogue,
  )
}

export function updateDialogueTextAtId<
  T extends { stableId: string; text: string },
>(dialogues: readonly T[], stableId: string, text: string): T[] | null {
  if (!stableId.trim()) return null
  let found = false
  const updated = dialogues.map(dialogue => {
    if (dialogue.stableId !== stableId) return dialogue
    found = true
    return { ...dialogue, text }
  })
  return found ? updated : null
}
