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

export interface EslintPerformanceTrace {
  readonly configEvaluation?: {
    readonly durationMs: number
  }
  readonly configResolution?: ModuleResolutionWorker.ResolutionStats
  readonly error?: {
    readonly details: ModuleResolutionWorker.ErrorDetails
    readonly stage:
      | 'configEvaluation'
      | 'configResolution'
      | 'eslintEvaluation'
      | 'eslintResolution'
      | 'lint'
  }
  readonly eslintEvaluation?: {
    readonly durationMs: number
  }
  readonly eslintResolution?: ModuleResolutionWorker.ResolutionStats
  readonly lint?: {
    readonly diagnostics: readonly LintResult[]
    readonly diagnosticCount: number
    readonly durationMs: number
  }
}

export interface Rpc {
  readonly dispose: () => Promise<void>
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
  disposePromise: Promise<void> | undefined
  rpcPromise: Promise<Rpc> | undefined
} = {
  createRpc,
  disposePromise: undefined,
  rpcPromise: undefined,
}

const getRpc = (): Promise<Rpc> => {
  state.rpcPromise ||= (async () => {
    await state.disposePromise
    return state.createRpc({
      commandMap,
      id: 'builtin.eslint.evaluation-worker',
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

export const clearCache = (): Promise<void> => {
  return invoke('EslintEvaluation.clearCache')
}

export const dispose = async (): Promise<void> => {
  const { disposePromise: previousDispose, rpcPromise } = state
  if (!rpcPromise) {
    await previousDispose
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

export function lint(
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  captureStats: true,
): Promise<EslintPerformanceTrace>
export function lint(
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
  captureStats?: false,
): Promise<LintResult[]>
export async function lint(
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
  captureStats = false,
): Promise<LintResult[] | EslintPerformanceTrace> {
  return ModuleResolutionWorker.runInSession(async () => {
    if (captureStats) {
      return invoke<EslintPerformanceTrace>(
        'EslintEvaluation.lint',
        text,
        filePath,
        configPath,
        loadedSuppressions,
        true,
      )
    }
    return invoke<LintResult[]>(
      'EslintEvaluation.lint',
      text,
      filePath,
      configPath,
      loadedSuppressions,
    )
  })
}
