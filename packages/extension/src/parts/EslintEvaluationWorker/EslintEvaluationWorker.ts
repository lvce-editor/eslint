import { createRpc, type CreateRpcOptions } from '@lvce-editor/api'
import type { LoadedSuppressions } from '../LoadSuppressions/LoadSuppressions.ts'
import * as ModuleResolutionWorker from '../ModuleResolutionWorker/ModuleResolutionWorker.ts'

export type LintResult = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  severity: 'error' | 'warning'
  ruleId: string | null
  fix?: {
    range: readonly [number, number]
    text: string
  }
}

export interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

const commandMap = {
  'ModuleResolution.loadEslintConfig': ModuleResolutionWorker.loadEslintConfig,
  'ModuleResolution.loadEslintModule': ModuleResolutionWorker.loadEslintModule,
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
    id: 'builtin.eslint.evaluation-worker',
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

export const clearCache = (): Promise<void> => {
  return invoke('EslintEvaluation.clearCache')
}

export const lint = async (
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
): Promise<LintResult[]> => {
  return ModuleResolutionWorker.runInSession(() =>
    invoke(
      'EslintEvaluation.lint',
      text,
      filePath,
      configPath,
      loadedSuppressions,
    ),
  )
}
