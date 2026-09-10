/** Pure text detection shared by server analysis and browser display. */
export const hasJapanese = (text: string) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(text)

/** Collapse layout gaps only between Japanese characters; preserve Latin word spacing. */
export function joinJapaneseLayoutGaps(text: string) {
  return text.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])/gu, '$1')
}
