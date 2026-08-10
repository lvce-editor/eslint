import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

const CacheName = 'eslint-config-files-cache'
const CacheKeyPrefix = 'https://eslint-config-files-cache.invalid/'
const FileContentCacheName = 'eslint-file-content-v1'
const FileContentCacheKeyPrefix = 'https://eslint-file-cache.invalid/'
const CacheVersion = 1
const maxConcurrentCacheReads = 64

export interface ModuleGraphSources {
  readonly entry: string
  readonly files: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

interface CachedPath {
  readonly hash: string
  readonly path: string
}

interface CachedModuleGraph {
  readonly entry: string
  readonly files: readonly CachedPath[]
  readonly modules: readonly CachedPath[]
  readonly resolutions: Readonly<Record<string, string>>
  readonly version: number
}

const getCacheKey = (cacheKey: string): string =>
  `${CacheKeyPrefix}${encodeURIComponent(cacheKey)}`

const getFileContentKey = (hash: string): string =>
  `${FileContentCacheKeyPrefix}${hash}`

const isCachedPath = (value: unknown): value is CachedPath => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CachedPath>
  return (
    typeof candidate.hash === 'string' && typeof candidate.path === 'string'
  )
}

const isCachedModuleGraph = (value: unknown): value is CachedModuleGraph => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CachedModuleGraph>
  return (
    candidate.version === CacheVersion &&
    typeof candidate.entry === 'string' &&
    Array.isArray(candidate.files) &&
    candidate.files.every(isCachedPath) &&
    Array.isArray(candidate.modules) &&
    candidate.modules.every(isCachedPath) &&
    Boolean(candidate.resolutions) &&
    typeof candidate.resolutions === 'object'
  )
}

const getCachedGraph = async (
  cacheKey: string,
): Promise<CachedModuleGraph | undefined> => {
  const cache = await caches.open(CacheName)
  const response = await cache.match(getCacheKey(cacheKey))
  if (!response) {
    return undefined
  }
  const value: unknown = await response.json()
  return isCachedModuleGraph(value) ? value : undefined
}

const setCachedGraph = async (
  cacheKey: string,
  graph: CachedModuleGraph,
): Promise<void> => {
  const cache = await caches.open(CacheName)
  await cache.put(getCacheKey(cacheKey), Response.json(graph))
}

const getCachedText = async (hash: string): Promise<string | undefined> => {
  const cache = await caches.open(FileContentCacheName)
  const response = await cache.match(getFileContentKey(hash))
  return response?.text()
}

const mapConcurrent = async <T, U>(
  values: readonly T[],
  task: (value: T) => Promise<U>,
): Promise<readonly U[]> => {
  const results: U[] = Array.from({ length: values.length })
  let nextIndex = 0
  const runNext = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await task(values[index])
    }
  }
  const workerCount = Math.min(maxConcurrentCacheReads, values.length)
  await Promise.all(Array.from({ length: workerCount }, runNext))
  return results
}

const loadSources = async (
  entries: readonly CachedPath[],
): Promise<Readonly<Record<string, string>> | undefined> => {
  const contents = await mapConcurrent(entries, async (entry) => {
    const content = await getCachedText(entry.hash)
    if (
      content === undefined ||
      (await ComputeTextHash.computeTextHash(content)) !== entry.hash
    ) {
      return undefined
    }
    return content
  })
  if (contents.includes(undefined)) {
    return undefined
  }
  return Object.fromEntries(
    entries.map((entry, index) => [entry.path, contents[index]]),
  ) as Readonly<Record<string, string>>
}

export const restore = async (
  cacheKey: string,
): Promise<ModuleGraphSources | undefined> => {
  try {
    const cached = await getCachedGraph(cacheKey)
    if (!cached) {
      return undefined
    }
    const entries = [...cached.modules, ...cached.files]
    const hashes = await FileSystem.getFileHashes(
      entries.map((entry) => entry.path),
    )
    if (
      hashes.length !== entries.length ||
      hashes.some((hash, index) => hash !== entries[index].hash)
    ) {
      return undefined
    }
    const [modules, files] = await Promise.all([
      loadSources(cached.modules),
      loadSources(cached.files),
    ])
    if (!modules || !files) {
      return undefined
    }
    return {
      entry: cached.entry,
      files,
      modules,
      resolutions: cached.resolutions,
    }
  } catch {
    return undefined
  }
}

export const save = async (
  cacheKey: string,
  graph: ModuleGraphSources,
): Promise<void> => {
  try {
    const modulePaths = Object.keys(graph.modules)
    const filePaths = Object.keys(graph.files)
    const paths = [...modulePaths, ...filePaths]
    const contents = [
      ...Object.values(graph.modules),
      ...Object.values(graph.files),
    ]
    const hashes = await FileSystem.getFileHashes(paths)
    const contentHashes = await mapConcurrent(
      contents,
      ComputeTextHash.computeTextHash,
    )
    if (
      hashes.length !== paths.length ||
      hashes.some(
        (hash, index) => hash === null || hash !== contentHashes[index],
      )
    ) {
      return
    }
    const moduleHashes = hashes.slice(
      0,
      modulePaths.length,
    ) as readonly string[]
    const fileHashes = hashes.slice(modulePaths.length) as readonly string[]
    await setCachedGraph(cacheKey, {
      entry: graph.entry,
      files: filePaths.map((path, index) => ({
        hash: fileHashes[index],
        path,
      })),
      modules: modulePaths.map((path, index) => ({
        hash: moduleHashes[index],
        path,
      })),
      resolutions: graph.resolutions,
      version: CacheVersion,
    })
  } catch {
    // Persistent caching is an optimization; module resolution remains the fallback.
  }
}

export const remove = async (cacheKey: string): Promise<void> => {
  try {
    const cache = await caches.open(CacheName)
    await cache.delete(getCacheKey(cacheKey))
  } catch {
    // Persistent caching is an optimization; stale entries are also guarded by hashes.
  }
}
