export const guessLanguageCode = (text: string): string => {
  if (!text) return 'en'

  // 1. 日文：只要包含平假名 (\u3040-\u309F) 或 片假名 (\u30A0-\u30FF)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'

  // 2. 韩文：只要包含谚文 (\uAC00-\uD7AF)
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'

  // 3. 中文：包含中日韩统一表意文字 (\u4E00-\u9FFF)，且前面没有命中日韩
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'

  // 4. 俄文/西里尔字母
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'

  // 5. 默认兜底：英文及其他印欧语系（法、德、西等）。
  // 它们的分词逻辑高度一致，都是基于空格和标点符号，用 'en' 规则分词完全没问题。
  return 'en'
}
