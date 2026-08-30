import { getQuestionEditorTypeConfig } from '@/modules/questions/domain/editor'

export default function QuestionTypeBadge({ type }: { type: string }) {
  const config = getQuestionEditorTypeConfig(type)
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-black ${config.color}`}>
      {config.label}
    </span>
  )
}
