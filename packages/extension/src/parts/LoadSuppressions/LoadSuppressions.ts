import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as Path from '../Path/Path.ts'

interface Suppressions {
  readonly [filePath: string]: {
    readonly [ruleId: string]: {
      readonly count: number
    }
  }
}

export interface LoadedSuppressions {
  readonly baseDirectory: string
  readonly suppressions: Suppressions
}

const suppressionsFileName = 'eslint-suppressions.json'

const maxDepth = 10
const loadedSuppressionsCache = new Map<
  string,
  Promise<LoadedSuppressions | undefined>
>()

const parseSuppressions = (content: string, path: string): Suppressions => {
  try {
    return JSON.parse(content) as Suppressions
  } catch (error) {
    throw new Error(`Failed to parse suppressions file at ${path}`, {
      cause: error,
    })
  }
}

const loadSuppressionsUncached = async (
  startDirectory: string,
): Promise<LoadedSuppressions | undefined> => {
  let currentDirectory = startDirectory
  for (let depth = 0; depth < maxDepth; depth++) {
    let entries: Awaited<ReturnType<typeof FileSystem.readDirWithFileTypes>>
    try {
      entries = await FileSystem.readDirWithFileTypes(currentDirectory)
    } catch {
      return undefined
    }
    const hasSuppressionsFile = entries.some(
      (entry) => entry.isFile && entry.name === suppressionsFileName,
    )
    if (hasSuppressionsFile) {
      const path = Path.join(currentDirectory, suppressionsFileName)
      const content = await FileSystem.readFile(path)
      return {
        baseDirectory: currentDirectory,
        suppressions: parseSuppressions(content, path),
      }
    }
    const parentDirectory = Path.dirname(currentDirectory)
    if (parentDirectory === currentDirectory) {
      return undefined
    }
    currentDirectory = parentDirectory
  }
  return undefined
}

export const clearCache = (): void => {
  loadedSuppressionsCache.clear()
}

export const loadSuppressions = (
  filePath: string,
  configPath: string | null,
): Promise<LoadedSuppressions | undefined> => {
  const startDirectory = Path.dirname(configPath ?? filePath)
  let loadedSuppressions = loadedSuppressionsCache.get(startDirectory)
  if (!loadedSuppressions) {
    loadedSuppressions = loadSuppressionsUncached(startDirectory)
    loadedSuppressionsCache.set(startDirectory, loadedSuppressions)
  }
  return loadedSuppressions
}
