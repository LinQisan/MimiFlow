export default function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <h3 className='pb-2 pt-4 text-xs font-medium tracking-wide text-fg-3'>
      {title}
      <span className='ml-2 tabular-nums'>{count.toLocaleString('zh-CN')}</span>
    </h3>
  )
}
