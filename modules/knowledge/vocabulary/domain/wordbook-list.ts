import type { FolderItem } from '../types'

export const listWordbooks = (wordbooks: FolderItem[]) =>
  wordbooks
    .slice()
    .sort(
      (left, right) =>
        left.seriesName.localeCompare(right.seriesName, 'zh-Hans-CN') ||
        left.name.localeCompare(right.name, 'zh-Hans-CN'),
    )
    .map(wordbook => ({
      ...wordbook,
      depth: 0,
      pathLabel: `${wordbook.seriesName} / ${wordbook.name}`,
      totalCount: wordbook.count || 0,
    }))
