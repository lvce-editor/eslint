import {
  createRpc,
  type CreateRpcOptions,
  type FileChanges,
} from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

export interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

const commandMap = {
  'FileSystem.readDirWithFileTypes': FileSystem.readDirWithFileTypes,
  'FileSystem.readFile': FileSystem.readFile,
  'FileSystem.stat': FileSystem.stat,
}

type CreateRpc = (options: CreateRpcOptions) => Promise<Rpc>

export const state: {
  createRpc: CreateRpc
  rpcPromise: Promise<Rpc> | undefined
} = {
  createRpc,
  rpcPromise: undefined,
}

const getRpc = (): Promise<Rpc> => {
  state.rpcPromise ||= state.createRpc({
    commandMap,
    name: 'ESLint Module Resolution Worker',
    url: new URL('moduleResolutionWorkerMain.js', import.meta.url).href,
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
  return invoke('ModuleResolution.invalidateForFileChanges', changes)
}

export const loadEslintConfig = (
  path: string,
  filePath?: string,
): Promise<ModuleGraph> => {
  return invoke('ModuleResolution.loadEslintConfig', path, filePath)
}

export const loadEslintModule = (path: string): Promise<ModuleGraph> => {
  return invoke('ModuleResolution.loadEslintModule', path)
}
