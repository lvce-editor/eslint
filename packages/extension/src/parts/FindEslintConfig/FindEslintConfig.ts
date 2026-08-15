import * as FileSystem from '../FileSystem/FileSystem.ts'

const configFileName = 'eslint.config.js'
const configPaths = new Map<string, Promise<string | null>>()

const findEslintConfigUncached = async (
  startDirectory: string,
): Promise<string | null> => {
  let currentDir = startDirectory
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

export const clearCache = (): void => {
  configPaths.clear()
}

const getStartDirectory = (filePath: string): string => {
  const pathParts = filePath.split('/')
  pathParts.pop()
  return pathParts.join('/') || '/'
}

export const findEslintConfig = (filePath: string): Promise<string | null> => {
  const startDirectory = getStartDirectory(filePath)
  let configPath = configPaths.get(startDirectory)
  if (!configPath) {
    configPath = findEslintConfigUncached(startDirectory)
    configPaths.set(startDirectory, configPath)
  }
  return configPath
}
