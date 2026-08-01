import { useEffect, useMemo } from 'react'

import { getStem } from '@/modules/import/audio/domain'

export function useAudioFileCatalog({
  existingAudioFiles,
  selectedAudioFolder,
  loadFiles,
  setExistingAudioFiles,
  setLoading,
}: {
  existingAudioFiles: string[]
  selectedAudioFolder: string
  loadFiles: () => Promise<{ success: boolean; files: string[] }>
  setExistingAudioFiles: (files: string[]) => void
  setLoading: (loading: boolean) => void
}) {
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const result = await loadFiles()
        if (active && result.success) setExistingAudioFiles(result.files)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [loadFiles, setExistingAudioFiles, setLoading])

  const audioFolderMap = useMemo(() => {
    const folderMap = new Map<string, string[]>()
    for (const filePath of existingAudioFiles) {
      const normalized = filePath.startsWith('/audios/')
        ? filePath.slice('/audios/'.length)
        : filePath.replace(/^\/+/, '')
      const segments = normalized.split('/').filter(Boolean)
      const folder =
        segments.length > 1 ? segments.slice(0, -1).join('/') : '(根目录)'
      const files = folderMap.get(folder) || []
      files.push(filePath)
      folderMap.set(folder, files)
    }

    return new Map(
      [...folderMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([folder, files]) => [folder, files.sort((a, b) => a.localeCompare(b))]),
    )
  }, [existingAudioFiles])

  const audioFolders = useMemo(
    () => [...audioFolderMap.keys()],
    [audioFolderMap],
  )
  const filesInSelectedFolder = useMemo(
    () => audioFolderMap.get(selectedAudioFolder) || [],
    [audioFolderMap, selectedAudioFolder],
  )

  const buildByStem = (files: string[]) => {
    const map = new Map<string, string[]>()
    for (const audioPath of files) {
      const stem = getStem(audioPath.split('/').pop() || audioPath)
      const bucket = map.get(stem) || []
      bucket.push(audioPath)
      map.set(stem, bucket)
    }
    return map
  }

  const siteAudioByStem = useMemo(
    () => buildByStem(existingAudioFiles),
    [existingAudioFiles],
  )
  const scopedAudioByStem = useMemo(
    () => buildByStem(filesInSelectedFolder),
    [filesInSelectedFolder],
  )

  return {
    audioFolderMap,
    audioFolders,
    filesInSelectedFolder,
    siteAudioByStem,
    scopedAudioByStem,
  }
}
