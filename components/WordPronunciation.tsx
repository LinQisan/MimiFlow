'use client'

import { guessLanguageCode } from '@/utils/langDetector'
import { buildJapaneseRubyHtml } from '@/utils/japaneseRuby'

export default function WordPronunciation({
  word,
  pronunciation,
  pronunciations = [],
  showPronunciation = true,
  meanings = [],
  showMeaning = false,
  wordClassName = '',
  hintClassName = '',
  meaningClassName = '',
}: {
  word: string
  pronunciation?: string
  pronunciations?: string[]
  showPronunciation?: boolean
  meanings?: string[]
  showMeaning?: boolean
  wordClassName?: string
  hintClassName?: string
  meaningClassName?: string
}) {
  const lang = guessLanguageCode(word)
  const pron =
    (pronunciation || '').trim() ||
    pronunciations.map(item => item.trim()).find(Boolean) ||
    ''
  const shouldShowHint = showPronunciation && !!pron
  const hasKanji = /[\u4e00-\u9fff]/.test(word)
  const parsedMeanings = meanings.map(item => item.trim()).filter(Boolean)
  const shouldShowMeaning = showMeaning && parsedMeanings.length > 0

  // 只要词中含汉字且有注音，就强制使用 ruby，避免“纯汉字词被识别为 zh 时不显示注音”。
  if (hasKanji) {
    if (!shouldShowHint) {
      return <div className={wordClassName}>{word}</div>
    }
    const rubyHtml = buildJapaneseRubyHtml(word, pron, {
      rubyClassName: wordClassName,
      rtClassName: hintClassName,
    })
    return <span dangerouslySetInnerHTML={{ __html: rubyHtml }} />
  }

  if (lang === 'en') {
    return (
      <div>
        <div className={wordClassName}>{word}</div>
        {shouldShowHint && <div className={hintClassName}>/{pron}/</div>}
      </div>
    )
  }

  return (
    <div className={wordClassName}>{word}</div>
  )
}
