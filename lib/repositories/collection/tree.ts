type CollectionTreeLike = {
  id: string
  title: string
  parentId?: string | null
  sortOrder?: number | null
}

type CollectionTreeNode<T extends CollectionTreeLike> = T & {
  children: CollectionTreeNode<T>[]
}

export type CollectionTreeOption<T extends CollectionTreeLike> = T & {
  depth: number
  order: number
  pathLabel: string
}

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

const compareCollectionNodes = <T extends CollectionTreeLike>(a: T, b: T) => {
  const sortOrderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  if (sortOrderDiff !== 0) return sortOrderDiff
  return collator.compare(a.title, b.title)
}

const normalizePathSegments = (segments: string[]) => {
  const normalized: string[] = []
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    if (normalized[normalized.length - 1] === trimmed) continue
    normalized.push(trimmed)
  }
  return normalized
}

export function buildCollectionTree<T extends CollectionTreeLike>(
  items: T[],
): CollectionTreeNode<T>[] {
  const nodeMap = new Map<string, CollectionTreeNode<T>>()
  items.forEach(item => nodeMap.set(item.id, { ...item, children: [] }))

  const roots: CollectionTreeNode<T>[] = []
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortTree = (nodes: CollectionTreeNode<T>[]) => {
    nodes.sort(compareCollectionNodes)
    nodes.forEach(node => sortTree(node.children))
  }

  sortTree(roots)
  return roots
}

export function flattenCollectionTree<T extends CollectionTreeLike>(
  nodes: CollectionTreeNode<T>[],
  depth = 0,
  pathSegments: string[] = [],
  acc: CollectionTreeOption<T>[] = [],
): CollectionTreeOption<T>[] {
  nodes.forEach(node => {
    const nextSegments = normalizePathSegments([...pathSegments, node.title])
    acc.push({
      ...node,
      depth,
      order: acc.length,
      pathLabel: nextSegments.join(' / '),
    })
    flattenCollectionTree(node.children, depth + 1, nextSegments, acc)
  })
  return acc
}

export function buildCollectionTreeOptions<T extends CollectionTreeLike>(
  items: T[],
) {
  return flattenCollectionTree(buildCollectionTree(items))
}
