import { redirect } from 'next/navigation'

import { buildSearchDetailHref } from '@/features/search/domain'

export default async function LegacySearchResultPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>
}) {
  const { type, id } = await params
  redirect(buildSearchDetailHref(id, type, ''))
}
