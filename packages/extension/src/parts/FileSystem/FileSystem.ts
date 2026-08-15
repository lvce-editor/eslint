import {
  getFileHash as getFileHashApi,
  getFileHashes as getFileHashesApi,
  readDirWithFileTypes as readDirWithFileTypesApi,
  readFile as readFileApi,
  stat as statApi,
} from '@lvce-editor/api'
import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'
import * as FileContentCache from '../FileContentCache/FileContentCache.ts'
import * as Logger from '../Logger/Logger.ts'

interface FileSystemApi {
  readonly getFileHash?: typeof getFileHashApi
  readonly getFileHashes: typeof getFileHashesApi
  readonly readDirWithFileTypes: typeof readDirWithFileTypesApi
  readonly readFile: typeof readFileApi
  readonly stat: typeof statApi
}

interface TextCache {
  readonly getText: (hash: string) => Promise<string | undefined>
  readonly setText: (hash: string, content: string) => Promise<void>
}

export const state: {
  api: FileSystemApi
  cache: TextCache
  computeTextHash: (text: string) => Promise<string>
  uriHashes: Map<string, string>
} = {
  api: {
    getFileHash: getFileHashApi,
    getFileHashes: getFileHashesApi,
    readDirWithFileTypes: readDirWithFileTypesApi,
    readFile: readFileApi,
    stat: statApi,
  },
  cache: FileContentCache,
  computeTextHash: ComputeTextHash.computeTextHash,
  uriHashes: new Map(),
}

const toFileUri = (path: string): string => {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return path
  }
  return new URL(path, 'file://').href
}

const getFileHash = async (uri: string): Promise<string | undefined> => {
  const getFileHashFn = state.api.getFileHash
  if (!getFileHashFn) {
    return undefined
  }
  try {
    return await getFileHashFn(uri)
  } catch (error) {
    Logger.warn(`Failed to hash ${uri}`, error)
    return undefined
  }
}

export const getFileHashes = async (
  paths: readonly string[],
): Promise<readonly (string | null)[]> => {
  const uris = paths.map(toFileUri)
  const fileUris = uris.filter((uri) => uri.startsWith('file://'))
  const hashes: Array<string | null> = uris.map(() => null)
  try {
    const fileHashes = await state.api.getFileHashes(fileUris)
    let fileIndex = 0
    for (let index = 0; index < uris.length; index++) {
      if (uris[index].startsWith('file://')) {
        hashes[index] = fileHashes[fileIndex++] ?? null
      }
    }
  } catch (error) {
    Logger.warn('Failed to hash ESLint files in one batch', error)
  }
  for (let index = 0; index < uris.length; index++) {
    const hash = hashes[index]
    if (typeof hash === 'string') {
      state.uriHashes.set(uris[index], hash)
    } else {
      state.uriHashes.delete(uris[index])
    }
  }
  return hashes
}

export const clearFileHashCache = (): void => {
  state.uriHashes.clear()
}

const getCachedContent = async (hash: string): Promise<string | undefined> => {
  try {
    const content = await state.cache.getText(hash)
    if (content === undefined) {
      return undefined
    }
    const cachedHash = await state.computeTextHash(content)
    return cachedHash === hash ? content : undefined
  } catch (error) {
    Logger.warn(`Failed to read ESLint file cache entry ${hash}`, error)
    return undefined
  }
}

const cacheContent = async (
  expectedHash: string,
  content: string,
): Promise<void> => {
  try {
    const contentHash = await state.computeTextHash(content)
    if (contentHash === expectedHash) {
      await state.cache.setText(expectedHash, content)
    }
  } catch (error) {
    Logger.warn(
      `Failed to write ESLint file cache entry ${expectedHash}`,
      error,
    )
  }
}

const readFileCached = async (uri: string): Promise<string> => {
  if (!uri.startsWith('file://')) {
    return state.api.readFile(uri)
  }
  const hash = state.uriHashes.get(uri) ?? (await getFileHash(uri))
  if (hash === undefined) {
    return state.api.readFile(uri)
  }
  const cachedContent = await getCachedContent(hash)
  if (cachedContent !== undefined) {
    return cachedContent
  }
  const content = await state.api.readFile(uri)
  await cacheContent(hash, content)
  return content
}

export const readFile = async (path: string): Promise<string> => {
  const uri = toFileUri(path)
  return readFileCached(uri)
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
