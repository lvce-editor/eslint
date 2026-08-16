import {
  createRpc,
  type CreateRpcOptions,
  type FileChanges,
} from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as LintResultCache from '../LintResultCache/LintResultCache.ts'

interface Rpc {
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

const state: {
  createRpc: CreateRpc
  rpcPromise: Promise<Rpc> | undefined
} = {
  createRpc,
  rpcPromise: undefined,
}

const getRpc = (): Promise<Rpc> => {
  state.rpcPromise ||= state.createRpc({
    commandMap,
    id: 'builtin.eslint.module-resolution-worker',
  })
  return state.rpcPromise
}

const invoke = async <T>(
  method: string,
  ...params: readonly unknown[]
): Promise<T> => {
  const rpc = await getRpc()
  return rpc.invoke(method, ...params)
}

export const invalidateForFileChanges = (
  changes: Readonly<FileChanges>,
): Promise<boolean> => {
  FileSystem.clearFileHashCache()
  LintResultCache.clearRevisionCache()
  return invoke('ModuleResolution.invalidateForFileChanges', changes)
}

export const loadEslintConfig = (
  path: string,
  filePath?: string,
): Promise<ModuleGraph> => {
  return invoke('ModuleResolution.loadEslintConfig', path, filePath)
}

export const loadEslintModule = (
  path: string,
  projectPath?: string,
): Promise<ModuleGraph> => {
  return projectPath
    ? invoke('ModuleResolution.loadEslintModule', path, projectPath)
    : invoke('ModuleResolution.loadEslintModule', path)
}
