import * as Rpc from '../Rpc/Rpc.ts'

export interface DirectoryEntry {
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly name: string
}

interface FileSystemApi {
  readonly readDirWithFileTypes: (
    uri: string,
  ) => Promise<readonly DirectoryEntry[]>
  readonly readFile: (uri: string) => Promise<string>
  readonly stat: (
    uri: string,
  ) => Promise<{ readonly isDirectory: boolean; readonly isFile: boolean }>
}

export const state: { api: FileSystemApi } = {
  api: {
    readDirWithFileTypes: (uri) =>
      Rpc.invoke('FileSystem.readDirWithFileTypes', uri),
    readFile: (uri) => Rpc.invoke('FileSystem.readFile', uri),
    stat: (uri) => Rpc.invoke('FileSystem.stat', uri),
  },
}

const toFileUri = (path: string): string => {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return path
  }
  return new URL(path, 'file://').href
}

export const readFile = (path: string): Promise<string> => {
  return state.api.readFile(toFileUri(path))
}

export const readDirWithFileTypes = (
  path: string,
): Promise<readonly DirectoryEntry[]> => {
  return state.api.readDirWithFileTypes(toFileUri(path))
}

export const stat = (
  path: string,
): Promise<{ readonly isDirectory: boolean; readonly isFile: boolean }> => {
  return state.api.stat(toFileUri(path))
}
