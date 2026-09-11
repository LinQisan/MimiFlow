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
