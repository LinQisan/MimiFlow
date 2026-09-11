// Shared import collection option helpers.
import type { CollectionBrowserOption } from './CollectionBrowserSelect'
import { buildCollectionTreeOptions } from '@/lib/repositories/collection/tree'

type CollectionBrowserOptionSource = {
  id: string
  name?: string
  title?: string
  parentId?: string | null
  sortOrder?: number | null
}

export function toCollectionBrowserOptions<T extends CollectionBrowserOptionSource>(
  collections: T[],
): CollectionBrowserOption[] {
  return buildCollectionTreeOptions(
    collections.map(collection => ({
      ...collection,
      title: collection.title || collection.name || '',
    })),
  ).map(item => ({
    value: item.id,
    label: item.title,
    searchText: item.pathLabel,
    parentId: item.parentId,
    depth: item.depth,
    order: item.order,
  }))
}
