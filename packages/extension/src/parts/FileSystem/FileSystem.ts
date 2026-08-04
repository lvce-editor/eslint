import {
  type OutputChannel,
  readDirWithFileTypes as readDirWithFileTypesApi,
  readFile as readFileApi,
  stat as statApi,
} from '@lvce-editor/api'
import { outputChannel } from '../EslintOutputChannel/EslintOutputChannel.ts'
import * as Logger from '../Logger/Logger.ts'

interface FileSystemApi {
  readonly readDirWithFileTypes: typeof readDirWithFileTypesApi
  readonly readFile: typeof readFileApi
  readonly stat: typeof statApi
}

export const state: {
  api: FileSystemApi
  now: () => number
  outputChannel: Pick<OutputChannel, 'appendLine'>
} = {
  api: {
    readDirWithFileTypes: readDirWithFileTypesApi,
    readFile: readFileApi,
    stat: statApi,
  },
  now: () => performance.now(),
  outputChannel,
}

const toFileUri = (path: string): string => {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return path
  }
  return new URL(path, 'file://').href
}

export const readFile = async (path: string): Promise<string> => {
  const uri = toFileUri(path)
  const startTime = state.now()
  try {
    return await state.api.readFile(uri)
  } finally {
    const duration = state.now() - startTime
    try {
      await state.outputChannel.appendLine(
        `Read ${uri} in ${duration.toFixed(2)}ms`,
      )
    } catch (error) {
      Logger.warn('Failed to write ESLint file read timing', error)
    }
  }
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
  const entries = await state.api.readDirWithFileTypes(toFileUri(path))
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
  const type = await state.api.stat(toFileUri(path))
  return {
    isDirectory: type === 3 || type === 11,
    isFile: type === 7 || type === 10,
  }
}
