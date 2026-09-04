import {
  createRpc,
  type CreateRpcOptions,
  type FileChanges,
} from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as LintResultCache from '../LintResultCache/LintResultCache.ts'
import * as ModuleGraphDependencies from '../ModuleGraphDependencies/ModuleGraphDependencies.ts'

export interface ErrorDetails {
  readonly code?: string | number
  readonly message: string
  readonly name: string
  readonly stack?: string
}

interface FileRead {
  readonly contentLength?: number
  readonly durationMs: number
  readonly error?: string
  readonly path: string
}

export interface ResolutionStats {
  readonly durationMs: number
  readonly fileReadCount: number
  readonly files: readonly FileRead[]
  readonly totalContentLength: number
  readonly uniqueFileCount: number
}

export interface ModuleResolutionTrace {
  readonly error?: ErrorDetails
  readonly graph?: ModuleGraph
  readonly stats: ResolutionStats
}

interface Rpc {
  readonly dispose: () => void | Promise<void>
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

const commandMap = {
  'FileSystem.getFileHashes': FileSystem.getFileHashes,
  'FileSystem.readDirWithFileTypes': FileSystem.readDirWithFileTypes,
  'FileSystem.readFile': FileSystem.readFile,
  'FileSystem.readFileAsBase64': FileSystem.readFileAsBase64,
  'FileSystem.stat': FileSystem.stat,
}

type CreateRpc = (options: CreateRpcOptions) => Promise<Rpc>

export const state: {
  activeSessions: number
  createRpc: CreateRpc
  disposePromise: Promise<void> | undefined
  invalidatedCacheKeys: Set<string>
  rpcPromise: Promise<Rpc> | undefined
} = {
  activeSessions: 0,
  createRpc,
  disposePromise: undefined,
  invalidatedCacheKeys: new Set(),
  rpcPromise: undefined,
}

const getRpc = (): Promise<Rpc> => {
  state.rpcPromise ||= (async () => {
    await state.disposePromise
    return state.createRpc({
      commandMap,
      id: 'builtin.eslint.module-resolution-worker',
    })
  })()
  return state.rpcPromise
}

const invoke = async <T>(
  method: string,
  ...params: readonly unknown[]
): Promise<T> => {
  const rpc = await getRpc()
  return rpc.invoke(method, ...params)
}

const dispose = async (): Promise<void> => {
  const { disposePromise: previousDispose, rpcPromise } = state
  if (!rpcPromise) {
    return
  }
  state.rpcPromise = undefined
  const disposePromise = (async (): Promise<void> => {
    await previousDispose
    const { dispose: disposeRpc, invoke: invokeRpc } = await rpcPromise
    try {
      await invokeRpc('Worker.dispose')
    } finally {
      await disposeRpc()
    }
  })()
  state.disposePromise = disposePromise
  try {
    await disposePromise
  } finally {
    if (state.disposePromise === disposePromise) {
      state.disposePromise = undefined
    }
  }
}

export const clearCache = (): void => {
  state.invalidatedCacheKeys.clear()
  ModuleGraphDependencies.clear()
}

export const runInSession = async <T>(task: () => Promise<T>): Promise<T> => {
  state.activeSessions++
  try {
    return await task()
  } finally {
    state.activeSessions--
    if (state.activeSessions === 0) {
      await dispose()
    }
  }
}

const flushInvalidatedCacheKeys = async (): Promise<void> => {
  const cacheKeys = [...state.invalidatedCacheKeys]
  if (cacheKeys.length === 0) {
    return
  }
  for (const cacheKey of cacheKeys) {
    state.invalidatedCacheKeys.delete(cacheKey)
  }
  try {
    await invoke('ModuleResolution.invalidateCacheKeys', cacheKeys)
    LintResultCache.clearInvalidatedGraphCacheKeys(
      cacheKeys.filter((cacheKey) => !state.invalidatedCacheKeys.has(cacheKey)),
    )
  } catch (error) {
    for (const cacheKey of cacheKeys) {
      state.invalidatedCacheKeys.add(cacheKey)
    }
    throw error
  }
}

export const invalidateForFileChanges = (
  changes: Readonly<FileChanges>,
): boolean => {
  FileSystem.clearFileHashCache()
  LintResultCache.clearRevisionCache()
  const cacheKeys = ModuleGraphDependencies.getAffectedCacheKeys(changes)
  if (cacheKeys.length === 0) {
    return false
  }
  for (const cacheKey of cacheKeys) {
    state.invalidatedCacheKeys.add(cacheKey)
  }
  LintResultCache.invalidateGraphCacheKeys(cacheKeys)
  ModuleGraphDependencies.clear()
  return true
}

export function loadEslintConfig(
  path: string,
  filePath: string | undefined,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintConfig(
  path: string,
  filePath?: string,
  captureStats?: false,
): Promise<ModuleGraph>
export async function loadEslintConfig(
  path: string,
  filePath?: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  await flushInvalidatedCacheKeys()
  if (captureStats) {
    return invoke<ModuleResolutionTrace>(
      'ModuleResolution.loadEslintConfig',
      path,
      filePath,
      true,
    )
  }
  const graph = await invoke<ModuleGraph>(
    'ModuleResolution.loadEslintConfig',
    path,
    filePath,
  )
  ModuleGraphDependencies.recordConfigGraph(path, filePath, graph)
  return graph
}

export function loadEslintModule(
  path: string,
  projectPath: string | undefined,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintModule(
  path: string,
  projectPath?: string,
  captureStats?: false,
): Promise<ModuleGraph>
export async function loadEslintModule(
  path: string,
  projectPath?: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  await flushInvalidatedCacheKeys()
  if (captureStats) {
    return invoke<ModuleResolutionTrace>(
      'ModuleResolution.loadEslintModule',
      path,
      projectPath,
      true,
    )
  }
  const graph = projectPath
    ? await invoke<ModuleGraph>(
        'ModuleResolution.loadEslintModule',
        path,
        projectPath,
      )
    : await invoke<ModuleGraph>('ModuleResolution.loadEslintModule', path)
  ModuleGraphDependencies.recordEslintGraph(path, projectPath, graph)
  return graph
}
