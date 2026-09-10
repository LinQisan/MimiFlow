import TrustedHtml from '@/components/ui/TrustedHtml'
import { buildJapaneseRubyHtml } from '@/utils/language/japaneseRuby'

export default function VocabularyRelationWord({ word, reading, showPronunciation = true }: {
  word: string
  reading?: string | null
  showPronunciation?: boolean
}) {
  const shouldAnnotate = showPronunciation &&
    /[\u3400-\u4dbf\u4e00-\u9fff々〆]/u.test(word) &&
    /[\u3040-\u30ff]/u.test(reading || '')
  const className = 'font-reading-body-ja font-medium text-slate-800'
  if (!shouldAnnotate) return <span className={className}>{word}</span>
  return (
    <TrustedHtml
      lang='ja'
      className={className}
      html={buildJapaneseRubyHtml(word, reading || '', {
        groupKanji: true,
        rubyClassName: 'jp-ruby',
        rtClassName: 'jp-ruby-rt text-[10px] font-normal text-slate-400',
      })}
    />
  )
}
