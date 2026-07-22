import {
  readDirWithFileTypes as readDirWithFileTypesApi,
  readFile as readFileApi,
  stat as statApi,
} from '@lvce-editor/api'

interface FileSystemApi {
  readonly readDirWithFileTypes: typeof readDirWithFileTypesApi
  readonly readFile: typeof readFileApi
  readonly stat: typeof statApi
}

export const state: { api: FileSystemApi } = {
  api: {
    readDirWithFileTypes: readDirWithFileTypesApi,
    readFile: readFileApi,
    stat: statApi,
  },
}

export const readFile = async (path: string): Promise<string> => {
  return state.api.readFile(path)
}

export const readDirWithFileTypes = async (
  path: string,
): Promise<
  Array<{
    name: string
    isFile: boolean
    isDirectory: boolean
  }>
> => {
  const entries = await state.api.readDirWithFileTypes(path)
  return entries.map((entry) => ({
    isDirectory: entry.type === 3 || entry.type === 11,
    isFile: entry.type === 7 || entry.type === 10,
    name: entry.name,
  }))
}

export const stat = async (
  path: string,
): Promise<{
  isFile: boolean
  isDirectory: boolean
}> => {
  const type = await state.api.stat(path)
  return {
    isDirectory: type === 3 || type === 11,
    isFile: type === 7 || type === 10,
  }
}
