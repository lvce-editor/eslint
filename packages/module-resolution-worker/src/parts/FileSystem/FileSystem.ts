import * as Rpc from '../Rpc/Rpc.ts'

export interface DirectoryEntry {
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly name: string
}

interface FileSystemApi {
  readonly getFileHashes?: (
    uris: readonly string[],
  ) => Promise<readonly (string | null)[]>
  readonly readDirWithFileTypes: (
    uri: string,
  ) => Promise<readonly DirectoryEntry[]>
  readonly readFile: (uri: string) => Promise<string>
  readonly stat: (
    uri: string,
  ) => Promise<{ readonly isDirectory: boolean; readonly isFile: boolean }>
}

export interface FileRead {
  readonly contentLength?: number
  readonly durationMs: number
  readonly error?: string
  readonly path: string
}

export interface FileReadCapture<T> {
  readonly durationMs: number
  readonly error?: unknown
  readonly reads: readonly FileRead[]
  readonly result?: T
}

export const state: {
  activeCapture: FileRead[] | undefined
  api: FileSystemApi
} = {
  activeCapture: undefined,
  api: {
    getFileHashes: (uris) => Rpc.invoke('FileSystem.getFileHashes', uris),
    readDirWithFileTypes: (uri) =>
      Rpc.invoke('FileSystem.readDirWithFileTypes', uri),
    readFile: (uri) => Rpc.invoke('FileSystem.readFile', uri),
    stat: (uri) => Rpc.invoke('FileSystem.stat', uri),
  },
}

const now = (): number => performance.now()

export const captureFileReads = async <T>(
  task: () => Promise<T>,
): Promise<FileReadCapture<T>> => {
  if (state.activeCapture) {
    throw new Error('A file read capture is already active')
  }
  const reads: FileRead[] = []
  const startTime = now()
  state.activeCapture = reads
  try {
    const result = await task()
    return {
      durationMs: now() - startTime,
      reads,
      result,
    }
  } catch (error) {
    return {
      durationMs: now() - startTime,
      error,
      reads,
    }
  } finally {
    state.activeCapture = undefined
  }
}

export const getFileHashes = (
  paths: readonly string[],
): Promise<readonly (string | null)[]> => {
  const getFileHashesFn = state.api.getFileHashes
  if (!getFileHashesFn) {
    return Promise.resolve(paths.map(() => null))
  }
  return getFileHashesFn(paths.map(toUri))
}

export const toUri = (path: string): string => {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) {
    return path
  }
  const normalizedPath = path.replaceAll('\\', '/')
  if (normalizedPath.startsWith('//')) {
    return new URL(normalizedPath, 'file://').href
  }
  const uri = new URL('file://')
  uri.pathname = normalizedPath
  return uri.href
}

export const toPath = (uri: string): string => {
  if (/^file:/i.test(uri)) {
    const parsed = new URL(uri)
    const authority = parsed.hostname ? `//${parsed.hostname}` : ''
    return `${authority}${decodeURIComponent(parsed.pathname)}`
  }
  return uri
}

export const readFile = async (path: string): Promise<string> => {
  const capture = state.activeCapture
  if (!capture) {
    return state.api.readFile(toUri(path))
  }
  const startTime = now()
  try {
    const content = await state.api.readFile(toUri(path))
    capture.push({
      contentLength: content.length,
      durationMs: now() - startTime,
      path,
    })
    return content
  } catch (error) {
    capture.push({
      durationMs: now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      path,
    })
    throw error
  }
}

export const readDirWithFileTypes = (
  path: string,
): Promise<readonly DirectoryEntry[]> => {
  return state.api.readDirWithFileTypes(toUri(path))
}

export const stat = (
  path: string,
): Promise<{ readonly isDirectory: boolean; readonly isFile: boolean }> => {
  return state.api.stat(toUri(path))
}
