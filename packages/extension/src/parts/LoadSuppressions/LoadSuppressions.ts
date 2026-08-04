import type {
  LoadedSuppressions,
  Suppressions,
} from '../ApplySuppressions/ApplySuppressions.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as Path from '../Path/Path.ts'

export const suppressionsFileName = 'eslint-suppressions.json'

const maxDepth = 10

const parseSuppressions = (content: string, path: string): Suppressions => {
  try {
    return JSON.parse(content) as Suppressions
  } catch (error) {
    throw new Error(`Failed to parse suppressions file at ${path}`, {
      cause: error,
    })
  }
}

export const loadSuppressions = async (
  filePath: string,
  configPath: string | null,
): Promise<LoadedSuppressions | undefined> => {
  let currentDirectory = Path.dirname(configPath ?? filePath)
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
