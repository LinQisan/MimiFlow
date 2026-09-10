export const normalizeJapanesePartOfSpeech = (raw: string) => {
  const value = raw.trim()
  if (!value) return ''
  if (/^[いイ]形容[詞词]?$/.test(value)) return 'い形容詞'
  if (/^[なナ]形容[詞词]?$/.test(value)) return 'な形容詞'
  if (/形容[動动]/.test(value)) return 'な形容詞'
  if (/助[動动]/.test(value)) return '助動詞'
  if (/形容[詞词]?/.test(value)) return '形容詞'
  if (/[名][詞词]?/.test(value)) return '名詞'
  if (/[動动][詞词]?/.test(value)) return '動詞'
  if (/[副][詞词]?/.test(value)) return '副詞'
  if (/助[詞词]?/.test(value)) return '助詞'
  if (/[連连]体[詞词]?/.test(value)) return '連体詞'
  if (/接[続续][詞词]?/.test(value)) return '接続詞'
  if (/感[動动叹嘆][詞词]?/.test(value)) return '感動詞'
  return value
}

export const normalizeSavedJapanesePartsOfSpeech = (values: string[]) =>
  Array.from(
    new Set(values.map(normalizeJapanesePartOfSpeech).filter(Boolean)),
  )
