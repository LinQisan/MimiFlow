import type { FolderItem } from '../types'

export type FolderTreeNode = FolderItem & { children: FolderTreeNode[] }

export const buildFolderTree = (folders: FolderItem[]) => {
  const nodeMap = new Map<string, FolderTreeNode>()
  folders.forEach(folder => nodeMap.set(folder.id, { ...folder, children: [] }))
  const roots: FolderTreeNode[] = []
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

const countFolderTreeEntries = (node: FolderTreeNode): number =>
  (node.count || 0) +
  node.children.reduce(
    (sum, child) => sum + countFolderTreeEntries(child),
    0,
  )

export const flattenFolderTree = (
  nodes: FolderTreeNode[],
  depth = 0,
  acc: Array<
    FolderItem & { depth: number; pathLabel: string; totalCount: number }
  > = [],
  ancestors: string[] = [],
) => {
  nodes
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    .forEach(node => {
      const path = [...ancestors, node.name]
      acc.push({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        count: node.count,
        depth,
        pathLabel: path.join(' / '),
        totalCount: countFolderTreeEntries(node),
      })
      flattenFolderTree(node.children, depth + 1, acc, path)
    })
  return acc
}
