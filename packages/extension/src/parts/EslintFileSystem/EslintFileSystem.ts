import type { FileSystem } from 'eslint'
import * as FileSystemRpc from '../FileSystem/FileSystem.ts'

export const createEslintFileSystem = (
  basePath: string,
): FileSystem => {
  const readFile = async (filePath: string): Promise<string> => {
    const fullPath = filePath.startsWith('/')
      ? filePath
      : `${basePath}/${filePath}`
    return await FileSystemRpc.readFile(fullPath)
  }

  const readdir = async (dirPath: string): Promise<string[]> => {
    const fullPath = dirPath.startsWith('/')
      ? dirPath
      : `${basePath}/${dirPath}`
    const entries = await FileSystemRpc.readDirWithFileTypes(fullPath)
    return entries.map((entry) => entry.name)
  }

  const stat = async (
    filePath: string,
  ): Promise<{ isFile: () => boolean; isDirectory: () => boolean }> => {
    const fullPath = filePath.startsWith('/')
      ? filePath
      : `${basePath}/${filePath}`
    const stats = await FileSystemRpc.stat(fullPath)
    return {
      isFile: () => stats.isFile,
      isDirectory: () => stats.isDirectory,
    }
  }

  return {
    readFile,
    readdir,
    stat,
  }
}

