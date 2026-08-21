import * as FileSystem from '../FileSystem/FileSystem.ts'

const configFileName = 'eslint.config.js'
const configPaths = new Map<string, Promise<string | null>>()

export interface ConfigDiscoveryTrace {
  readonly configPath: string | null
  readonly directories: readonly string[]
  readonly directoryReadCount: number
  readonly durationMs: number
}

const findEslintConfigUncached = async (
  startDirectory: string,
  directories?: string[],
): Promise<string | null> => {
  let currentDir = startDirectory
  // Search up the directory tree
  const maxDepth = 10
  let depth = 0

  while (depth < maxDepth) {
    try {
      directories?.push(currentDir)
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

export function findEslintConfig(
  filePath: string,
  captureStats: true,
): Promise<ConfigDiscoveryTrace>
export function findEslintConfig(
  filePath: string,
  captureStats?: false,
): Promise<string | null>
export async function findEslintConfig(
  filePath: string,
  captureStats = false,
): Promise<string | null | ConfigDiscoveryTrace> {
  const startDirectory = getStartDirectory(filePath)
  if (captureStats) {
    const directories: string[] = []
    const startTime = performance.now()
    const configPath = await findEslintConfigUncached(
      startDirectory,
      directories,
    )
    return {
      configPath,
      directories,
      directoryReadCount: directories.length,
      durationMs: performance.now() - startTime,
    }
  }
  let configPath = configPaths.get(startDirectory)
  if (!configPath) {
    configPath = findEslintConfigUncached(startDirectory)
    configPaths.set(startDirectory, configPath)
  }
  return configPath
}
