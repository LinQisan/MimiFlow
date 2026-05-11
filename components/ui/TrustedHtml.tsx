import type { ElementType, HTMLAttributes } from 'react'

type TrustedHtmlProps<T extends ElementType> = {
  as?: T
  html: string
} & Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML' | 'children'>

export default function TrustedHtml<T extends ElementType = 'span'>({
  as,
  html,
  ...props
}: TrustedHtmlProps<T>) {
  const Component = (as || 'span') as ElementType
  return <Component {...props} dangerouslySetInnerHTML={{ __html: html }} />
}
