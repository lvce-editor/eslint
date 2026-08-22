import * as CacheExpiration from '../CacheExpiration/CacheExpiration.ts'
import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

const CacheName = 'eslint-config-files-cache'
const CacheKeyPrefix = 'https://eslint-config-files-cache.invalid/'
const CompiledCacheName = 'eslint-compiled-module-graph-v1'
const CompiledCacheKeyPrefix = 'https://eslint-compiled-module-graph.invalid/'
const CacheVersion = 3
const CompiledCacheVersion = 1
const maxConcurrentCacheReads = 64

export interface ModuleGraphToCache {
  readonly entry: string
  readonly files: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, string>>
  readonly moduleSources: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

export interface RestoredModuleGraph {
  readonly entry: string
  readonly entrySource: string
  readonly files: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

interface CachedFile {
  readonly hash: string
  readonly uri: string
}

interface CachedModule extends CachedFile {
  readonly compiledHash: string
}

interface CachedModuleGraph {
  readonly entry: string
  readonly files: readonly CachedFile[]
  readonly modules: readonly CachedModule[]
  readonly revision: string
  readonly version: number
}

interface CachedSource {
  readonly source: string
  readonly uri: string
}

interface CompiledModuleGraph {
  readonly entrySource: string
  readonly files: readonly CachedSource[]
  readonly modules: readonly CachedSource[]
  readonly resolutions: Readonly<Record<string, string>>
  readonly version: number
}

const getCacheKey = (cacheKey: string): string =>
  `${CacheKeyPrefix}${encodeURIComponent(cacheKey)}`

const getCompiledCacheKey = (cacheKey: string): string =>
  `${CompiledCacheKeyPrefix}${encodeURIComponent(cacheKey)}`

const isCachedFile = (value: unknown): value is CachedFile => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CachedFile>
  return typeof candidate.hash === 'string' && typeof candidate.uri === 'string'
}

const isCachedModule = (value: unknown): value is CachedModule => {
  return (
    isCachedFile(value) &&
    typeof (value as Partial<CachedModule>).compiledHash === 'string'
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
    candidate.files.every(isCachedFile) &&
    Array.isArray(candidate.modules) &&
    candidate.modules.every(isCachedModule) &&
    typeof candidate.revision === 'string'
  )
}

const isCachedSource = (value: unknown): value is CachedSource => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CachedSource>
  return (
    typeof candidate.source === 'string' && typeof candidate.uri === 'string'
  )
}

const isCompiledModuleGraph = (
  value: unknown,
): value is CompiledModuleGraph => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CompiledModuleGraph>
  return (
    candidate.version === CompiledCacheVersion &&
    typeof candidate.entrySource === 'string' &&
    Array.isArray(candidate.files) &&
    candidate.files.every(isCachedSource) &&
    Array.isArray(candidate.modules) &&
    candidate.modules.every(isCachedSource) &&
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

const getCompiledGraph = async (
  cacheKey: string,
): Promise<CompiledModuleGraph | undefined> => {
  const cache = await caches.open(CompiledCacheName)
  const response = await cache.match(getCompiledCacheKey(cacheKey))
  if (!response) {
    return undefined
  }
  const value: unknown = await response.json()
  return isCompiledModuleGraph(value) ? value : undefined
}

const setJson = async (
  cacheName: string,
  key: string,
  value: unknown,
): Promise<void> => {
  const cache = await caches.open(cacheName)
  const content = JSON.stringify(value)
  const contentLength = new TextEncoder().encode(content).byteLength
  const response = new Response(content, {
    headers: {
      'Content-Length': String(contentLength),
      'Content-Type': 'application/json',
      Expires: CacheExpiration.getExpirationDate(),
    },
  })
  await cache.put(key, response)
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

const mapSources = (
  entries: readonly CachedSource[],
): Readonly<Record<string, string>> => {
  return Object.fromEntries(
    entries.map((entry) => [FileSystem.toPath(entry.uri), entry.source]),
  )
}

const hasValidCachedContent = async (
  cached: CachedModuleGraph,
  compiled: CompiledModuleGraph,
): Promise<boolean> => {
  const compiledModules = new Map(
    compiled.modules.map((module) => [module.uri, module.source]),
  )
  const compiledFiles = new Map(
    compiled.files.map((file) => [file.uri, file.source]),
  )
  const entryModule = cached.modules.find(
    (module) => module.uri === cached.entry,
  )
  if (
    !entryModule ||
    (await ComputeTextHash.computeTextHash(compiled.entrySource)) !==
      entryModule.hash
  ) {
    return false
  }
  const validModules = await mapConcurrent(cached.modules, async (module) => {
    const source = compiledModules.get(module.uri)
    return (
      source !== undefined &&
      (await ComputeTextHash.computeTextHash(source)) === module.compiledHash
    )
  })
  if (validModules.includes(false)) {
    return false
  }
  const validFiles = await mapConcurrent(cached.files, async (file) => {
    const source = compiledFiles.get(file.uri)
    return (
      source !== undefined &&
      (await ComputeTextHash.computeTextHash(source)) === file.hash
    )
  })
  return !validFiles.includes(false)
}

const computeRevision = (
  cached: Omit<CachedModuleGraph, 'revision'>,
): Promise<string> => {
  return ComputeTextHash.computeTextHash(JSON.stringify(cached))
}

const hasCurrentHashes = async (
  cached: CachedModuleGraph,
): Promise<boolean> => {
  const { revision, ...revisionInput } = cached
  if ((await computeRevision(revisionInput)) !== revision) {
    return false
  }
  const entries = [...cached.modules, ...cached.files]
  const hashes = await FileSystem.getFileHashes(
    entries.map((entry) => entry.uri),
  )
  return (
    hashes.length === entries.length &&
    hashes.every((hash, index) => hash === entries[index].hash)
  )
}

const mapResolutionPaths = (
  resolutions: Readonly<Record<string, string>>,
  mapPath: (path: string) => string,
): Readonly<Record<string, string>> => {
  return Object.fromEntries(
    Object.entries(resolutions).map(([key, resolved]) => {
      const separatorIndex = key.indexOf('\0')
      const parent = key.slice(0, separatorIndex)
      const specifier = key.slice(separatorIndex + 1)
      return [`${mapPath(parent)}\0${specifier}`, mapPath(resolved)]
    }),
  )
}

export const restore = async (
  cacheKey: string,
): Promise<RestoredModuleGraph | undefined> => {
  try {
    const cached = await getCachedGraph(cacheKey)
    if (!cached) {
      return undefined
    }
    if (!(await hasCurrentHashes(cached))) {
      return undefined
    }
    const compiled = await getCompiledGraph(cacheKey)
    if (!compiled || !(await hasValidCachedContent(cached, compiled))) {
      return undefined
    }
    return {
      entry: FileSystem.toPath(cached.entry),
      entrySource: compiled.entrySource,
      files: mapSources(compiled.files),
      modules: mapSources(compiled.modules),
      resolutions: mapResolutionPaths(compiled.resolutions, FileSystem.toPath),
    }
  } catch {
    return undefined
  }
}

export const save = async (
  cacheKey: string,
  graph: ModuleGraphToCache,
): Promise<void> => {
  try {
    const modulePaths = Object.keys(graph.moduleSources)
    const filePaths = Object.keys(graph.files)
    const paths = [...modulePaths, ...filePaths]
    const contents = [
      ...Object.values(graph.moduleSources),
      ...Object.values(graph.files),
    ]
    if (
      typeof graph.moduleSources[graph.entry] !== 'string' ||
      modulePaths.some((path) => typeof graph.modules[path] !== 'string')
    ) {
      return
    }
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
    const compiledHashes = await mapConcurrent(
      modulePaths.map((path) => graph.modules[path]),
      ComputeTextHash.computeTextHash,
    )
    const files = filePaths.map((path, index) => ({
      hash: fileHashes[index],
      uri: FileSystem.toUri(path),
    }))
    const modules = modulePaths.map((path, index) => ({
      compiledHash: compiledHashes[index],
      hash: moduleHashes[index],
      uri: FileSystem.toUri(path),
    }))
    const revisionInput = {
      entry: FileSystem.toUri(graph.entry),
      files,
      modules,
      version: CacheVersion,
    }
    const revision = await computeRevision(revisionInput)
    await setJson(CompiledCacheName, getCompiledCacheKey(cacheKey), {
      entrySource: graph.moduleSources[graph.entry],
      files: filePaths.map((path) => ({
        source: graph.files[path],
        uri: FileSystem.toUri(path),
      })),
      modules: modulePaths.map((path) => ({
        source: graph.modules[path],
        uri: FileSystem.toUri(path),
      })),
      resolutions: mapResolutionPaths(graph.resolutions, FileSystem.toUri),
      version: CompiledCacheVersion,
    })
    await setJson(CacheName, getCacheKey(cacheKey), {
      ...revisionInput,
      revision,
    })
  } catch {
    // Persistent caching is an optimization; module resolution remains the fallback.
  }
}

export const remove = async (cacheKey: string): Promise<void> => {
  try {
    const [cache, compiledCache] = await Promise.all([
      caches.open(CacheName),
      caches.open(CompiledCacheName),
    ])
    await Promise.all([
      cache.delete(getCacheKey(cacheKey)),
      compiledCache.delete(getCompiledCacheKey(cacheKey)),
    ])
  } catch {
    // Persistent caching is an optimization; stale entries are also guarded by hashes.
  }
}
