import {
  createRpc,
  type CreateRpcOptions,
  type FileChanges,
} from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as LintResultCache from '../LintResultCache/LintResultCache.ts'
import * as ModuleGraphDependencies from '../ModuleGraphDependencies/ModuleGraphDependencies.ts'

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
  'FileSystem.stat': FileSystem.stat,
}

type CreateRpc = (options: CreateRpcOptions) => Promise<Rpc>

export const state: {
  activeSessions: number
  createRpc: CreateRpc
  disposePromise: Promise<void> | undefined
  rpcPromise: Promise<Rpc> | undefined
} = {
  activeSessions: 0,
  createRpc,
  disposePromise: undefined,
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
  const rpcPromise = state.rpcPromise
  if (!rpcPromise) {
    return
  }
  state.rpcPromise = undefined
  const previousDispose = state.disposePromise
  const disposePromise = (async (): Promise<void> => {
    await previousDispose
    const rpc = await rpcPromise
    try {
      await rpc.invoke('Worker.dispose')
    } finally {
      await rpc.dispose()
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

export const invalidateForFileChanges = async (
  changes: Readonly<FileChanges>,
): Promise<boolean> => {
  FileSystem.clearFileHashCache()
  LintResultCache.clearRevisionCache()
  const cacheKeys = ModuleGraphDependencies.getAffectedCacheKeys(changes)
  if (cacheKeys.length === 0) {
    return false
  }
  await runInSession(() =>
    invoke('ModuleResolution.invalidateCacheKeys', cacheKeys),
  )
  ModuleGraphDependencies.clear()
  return true
}

export const loadEslintConfig = async (
  path: string,
  filePath?: string,
): Promise<ModuleGraph> => {
  const graph = await invoke<ModuleGraph>(
    'ModuleResolution.loadEslintConfig',
    path,
    filePath,
  )
  ModuleGraphDependencies.recordConfigGraph(path, filePath, graph)
  return graph
}

export const loadEslintModule = async (
  path: string,
  projectPath?: string,
): Promise<ModuleGraph> => {
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
