import path from 'node:path'

export function isPathInsideRoot(
  rootPath: string,
  targetPath: string,
  options: { allowRoot?: boolean } = {},
) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath))
  if (!relative) return options.allowRoot ?? true
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function resolvePathInsideRoot(
  rootPath: string,
  ...segments: string[]
) {
  const targetPath = path.resolve(rootPath, ...segments)
  return isPathInsideRoot(rootPath, targetPath) ? targetPath : null
}
