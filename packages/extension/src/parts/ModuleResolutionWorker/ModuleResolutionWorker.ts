import type { FileChanges } from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

export interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

declare const vscode: {
  readonly createRpc: (options: {
    readonly commandMap: Readonly<Record<string, unknown>>
    readonly id: string
  }) => Promise<Rpc>
}

const commandMap = {
  'FileSystem.readDirWithFileTypes': FileSystem.readDirWithFileTypes,
  'FileSystem.readFile': FileSystem.readFile,
  'FileSystem.stat': FileSystem.stat,
}

type CreateRpc = typeof vscode.createRpc

export const state: {
  createRpc: CreateRpc
  rpcPromise: Promise<Rpc> | undefined
} = {
  createRpc: (options) => vscode.createRpc(options),
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
  return invoke('ModuleResolution.invalidateForFileChanges', changes)
}

export const loadEslintConfig = (path: string): Promise<ModuleGraph> => {
  return invoke('ModuleResolution.loadEslintConfig', path)
}

export const loadEslintModule = (path: string): Promise<ModuleGraph> => {
  return invoke('ModuleResolution.loadEslintModule', path)
}
