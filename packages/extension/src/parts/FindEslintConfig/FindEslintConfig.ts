import * as FileSystem from '../FileSystem/FileSystem.ts'

export const configFileName = 'eslint.config.js'

export const findEslintConfig = async (
  filePath: string,
): Promise<string | null> => {
  const pathParts = filePath.split('/')
  const fileName = pathParts.pop()
  if (!fileName) {
    return null
  }

  let currentDir = pathParts.join('/')
  if (!currentDir) {
    currentDir = '/'
  }

  // Search up the directory tree
  const maxDepth = 10
  let depth = 0

  while (depth < maxDepth) {
    try {
      const entries = await FileSystem.readDirWithFileTypes(currentDir)
      const hasConfigFile = entries.some(
        (entry) => entry.isFile && entry.name === configFileName,
      )

      if (hasConfigFile) {
        return `${currentDir}/${configFileName}`
      }

      // Move up one directory
      if (currentDir === '/' || currentDir === '') {
        break
      }
      const parts = currentDir.split('/')
      parts.pop()
      currentDir = parts.length > 0 ? parts.join('/') : '/'
      depth++
    } catch {
      // Directory doesn't exist or can't be read
      break
    }
  }

  return null
}
