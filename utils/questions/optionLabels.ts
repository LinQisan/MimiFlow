const OPTION_LABEL_FORMATS = [
  'numeric',
  'upper-alpha',
  'circled-number',
  'katakana',
  'custom',
] as const

export type OptionLabelFormat = (typeof OPTION_LABEL_FORMATS)[number]

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const KATAKANA = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ']

export function normalizeOptionLabelFormat(
  value: unknown,
  fallback: OptionLabelFormat = 'upper-alpha',
): OptionLabelFormat {
  return OPTION_LABEL_FORMATS.includes(value as OptionLabelFormat)
    ? (value as OptionLabelFormat)
    : fallback
}
export function parseCustomOptionLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []
  return value
    .split(/[|｜,，\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function formatOptionLabel(
  index: number,
  format: OptionLabelFormat,
  customLabels: string[] = [],
) {
  if (format === 'numeric') return String(index + 1)
  if (format === 'circled-number') return CIRCLED_NUMBERS[index] || String(index + 1)
  if (format === 'katakana') return KATAKANA[index] || String(index + 1)
  if (format === 'custom') return customLabels[index] || String(index + 1)
  return String.fromCharCode(65 + index)
}
