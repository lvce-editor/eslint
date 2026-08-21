import type { LintResult } from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import type { LoadedSuppressions } from '../LoadSuppressions/LoadSuppressions.ts'
import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

const GraphCacheName = 'eslint-config-files-cache'
const GraphCacheKeyPrefix = 'https://eslint-config-files-cache.invalid/'
const GraphCacheVersion = 3
const ResultCacheName = 'eslint-lint-result-v1'
const ResultCacheKeyPrefix = 'https://eslint-lint-result.invalid/'
const ResultCacheVersion = 1

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

interface CachedLintResult {
  readonly fingerprint: string
  readonly results: readonly LintResult[]
  readonly version: number
}

const graphRevisions = new Map<string, Promise<string | undefined>>()
const invalidatedGraphCacheKeys = new Set<string>()

const getGraphCacheKey = (cacheKey: string): string =>
  `${GraphCacheKeyPrefix}${encodeURIComponent(cacheKey)}`

const getResultCacheKey = (filePath: string): string =>
  `${ResultCacheKeyPrefix}${encodeURIComponent(filePath)}`

const toPath = (uri: string): string => {
  if (/^file:\/+/.test(uri)) {
    return decodeURIComponent(new URL(uri).pathname)
  }
  return uri
}

const normalize = (path: string): string => {
  const normalizedSlashes = toPath(path).replaceAll('\\', '/')
  const match = /^([a-z][a-z\d+.-]*:\/\/)(.*)$/i.exec(normalizedSlashes)
  const prefix = match?.[1] ?? ''
  const pathValue = match?.[2] ?? normalizedSlashes
  const parts: string[] = []
  for (const part of pathValue.split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return `${prefix}/${parts.join('/')}`
}

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
    candidate.version === GraphCacheVersion &&
    typeof candidate.entry === 'string' &&
    Array.isArray(candidate.files) &&
    candidate.files.every(isCachedFile) &&
    Array.isArray(candidate.modules) &&
    candidate.modules.every(isCachedModule) &&
    typeof candidate.revision === 'string'
  )
}

const isLintResult = (value: unknown): value is LintResult => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<LintResult>
  return (
    typeof candidate.line === 'number' &&
    typeof candidate.column === 'number' &&
    typeof candidate.message === 'string' &&
    (candidate.severity === 'error' || candidate.severity === 'warning') &&
    (typeof candidate.ruleId === 'string' || candidate.ruleId === null)
  )
}

const isCachedLintResult = (value: unknown): value is CachedLintResult => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CachedLintResult>
  return (
    candidate.version === ResultCacheVersion &&
    typeof candidate.fingerprint === 'string' &&
    Array.isArray(candidate.results) &&
    candidate.results.every(isLintResult)
  )
}

const computeGraphRevision = (
  cached: Omit<CachedModuleGraph, 'revision'>,
): Promise<string> => {
  return ComputeTextHash.computeTextHash(JSON.stringify(cached))
}

const loadGraphRevision = async (
  cacheKey: string,
): Promise<string | undefined> => {
  try {
    const cache = await caches.open(GraphCacheName)
    const response = await cache.match(getGraphCacheKey(cacheKey))
    if (!response) {
      return undefined
    }
    const value: unknown = await response.json()
    if (!isCachedModuleGraph(value)) {
      return undefined
    }
    const { revision, ...revisionInput } = value
    if ((await computeGraphRevision(revisionInput)) !== revision) {
      return undefined
    }
    const entries = [...value.modules, ...value.files]
    const hashes = await FileSystem.getFileHashes(
      entries.map((entry) => entry.uri),
    )
    if (
      hashes.length !== entries.length ||
      hashes.some((hash, index) => hash !== entries[index].hash)
    ) {
      return undefined
    }
    return revision
  } catch {
    return undefined
  }
}

const getGraphRevision = async (
  cacheKey: string,
): Promise<string | undefined> => {
  if (invalidatedGraphCacheKeys.has(cacheKey)) {
    return undefined
  }
  let revision = graphRevisions.get(cacheKey)
  if (!revision) {
    revision = loadGraphRevision(cacheKey)
    graphRevisions.set(cacheKey, revision)
  }
  const value = await revision
  if (value === undefined && graphRevisions.get(cacheKey) === revision) {
    graphRevisions.delete(cacheKey)
  }
  return value
}

const getGraphCacheKeys = (
  filePath: string,
  configPath: string | null,
): readonly string[] => {
  const normalizedFilePath = normalize(filePath)
  const eslintPath = normalize(configPath ?? filePath)
  const keys = [`commonjs-project:${FileSystem.toUri(eslintPath)}`]
  if (configPath) {
    keys.unshift(
      `module:${FileSystem.toUri(normalize(configPath))}:${FileSystem.toUri(normalizedFilePath)}`,
    )
  }
  return keys
}

const getFingerprint = async (
  text: string,
  filePath: string,
  configPath: string | null,
  loadedSuppressions: LoadedSuppressions | undefined,
): Promise<string | undefined> => {
  const revisions = await Promise.all(
    getGraphCacheKeys(filePath, configPath).map(getGraphRevision),
  )
  if (revisions.includes(undefined)) {
    return undefined
  }
  const textHash = await ComputeTextHash.computeTextHash(text)
  return ComputeTextHash.computeTextHash(
    JSON.stringify({
      configPath,
      filePath,
      loadedSuppressions: loadedSuppressions ?? null,
      revisions,
      textHash,
      version: ResultCacheVersion,
    }),
  )
}

export const clearRevisionCache = (): void => {
  graphRevisions.clear()
}

export const clearCache = (): void => {
  graphRevisions.clear()
  invalidatedGraphCacheKeys.clear()
}

export const invalidateGraphCacheKeys = (
  cacheKeys: readonly string[],
): void => {
  for (const cacheKey of cacheKeys) {
    graphRevisions.delete(cacheKey)
    invalidatedGraphCacheKeys.add(cacheKey)
  }
}

export const clearInvalidatedGraphCacheKeys = (
  cacheKeys: readonly string[],
): void => {
  for (const cacheKey of cacheKeys) {
    invalidatedGraphCacheKeys.delete(cacheKey)
  }
}

export const restore = async (
  text: string,
  filePath: string,
  configPath: string | null,
  loadedSuppressions?: LoadedSuppressions,
): Promise<readonly LintResult[] | undefined> => {
  try {
    const fingerprint = await getFingerprint(
      text,
      filePath,
      configPath,
      loadedSuppressions,
    )
    if (!fingerprint) {
      return undefined
    }
    const cache = await caches.open(ResultCacheName)
    const response = await cache.match(getResultCacheKey(filePath))
    if (!response) {
      return undefined
    }
    const value: unknown = await response.json()
    return isCachedLintResult(value) && value.fingerprint === fingerprint
      ? value.results
      : undefined
  } catch {
    return undefined
  }
}

export const save = async (
  text: string,
  filePath: string,
  configPath: string | null,
  loadedSuppressions: LoadedSuppressions | undefined,
  results: readonly LintResult[],
): Promise<void> => {
  try {
    const fingerprint = await getFingerprint(
      text,
      filePath,
      configPath,
      loadedSuppressions,
    )
    if (!fingerprint) {
      return
    }
    const value: CachedLintResult = {
      fingerprint,
      results,
      version: ResultCacheVersion,
    }
    const content = JSON.stringify(value)
    const contentLength = new TextEncoder().encode(content).byteLength
    const cache = await caches.open(ResultCacheName)
    await cache.put(
      getResultCacheKey(filePath),
      new Response(content, {
        headers: {
          'Content-Length': String(contentLength),
          'Content-Type': 'application/json',
        },
      }),
    )
  } catch {
    // Persistent lint results are an optimization only.
  }
}
