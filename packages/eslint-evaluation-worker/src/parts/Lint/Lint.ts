import type { ESLint, Linter } from 'eslint'
import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { EslintModule } from '../LoadEslint/LoadEslint.ts'
import type { EvaluatedModuleGraph } from '../ModuleRuntime/ModuleRuntime.ts'
import * as ApplySuppressions from '../ApplySuppressions/ApplySuppressions.ts'
import * as Path from '../Path/Path.ts'

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

interface ErrorDetails {
  readonly code?: string | number
  readonly message: string
  readonly name: string
  readonly stack?: string
}

export interface LintPerformanceTrace {
  readonly configEvaluation: {
    readonly durationMs: number
  }
  readonly error?: {
    readonly details: ErrorDetails
    readonly stage: 'configEvaluation' | 'lint'
  }
  readonly lint?: {
    readonly diagnostics: readonly LintResult[]
    readonly diagnosticCount: number
    readonly durationMs: number
  }
}

type EslintConstructor = typeof ESLint
type LinterConstructor = typeof Linter
type LintMessage = Linter.LintMessage

type ModernLintContext = {
  readonly engine: InstanceType<EslintConstructor>
  readonly type: 'modern'
}

type LegacyLintContext = {
  readonly config: any[]
  readonly engine: InstanceType<LinterConstructor>
  readonly type: 'legacy'
}

type LintContext = LegacyLintContext | ModernLintContext

const graphContexts = new Map<string, WeakMap<EslintModule, LintContext>>()
const defaultContexts = new Map<string, WeakMap<EslintModule, LintContext>>()

type GlobalWithProcess = typeof globalThis & {
  readonly process?: {
    readonly platform?: string
    readonly cwd?: () => string
  }
}

export const clearCache = (): void => {
  graphContexts.clear()
  defaultContexts.clear()
}

const isNoMatchingConfigMessage = (message: LintMessage): boolean => {
  return (
    message.ruleId === null &&
    message.line === 0 &&
    message.column === 0 &&
    message.message.startsWith('No matching configuration found')
  )
}

const defaultConfig = {
  languageOptions: {
    ecmaVersion: 'latest' as const,
    sourceType: 'module' as const,
  },
  rules: {
    'no-debugger': 'error' as const,
    'no-undef': 'error' as const,
    'no-unreachable': 'error' as const,
    'no-unused-vars': 'warn' as const,
  },
}

const now = (): number => performance.now()

const toErrorDetails = (error: unknown): ErrorDetails => {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      name: 'Error',
    }
  }
  const { code } = error as Error & { readonly code?: unknown }
  return {
    ...((typeof code === 'string' || typeof code === 'number') && { code }),
    message: error.message,
    name: error.name,
    ...(error.stack && { stack: error.stack }),
  }
}

const getMajorVersion = (Eslint: EslintConstructor): number => {
  const [majorVersion = ''] = Eslint.version?.split('.', 1) ?? []
  const major = Number(majorVersion)
  return Number.isFinite(major) ? major : 0
}

const toNativeAbsolutePath = (filePath: string): string => {
  const { process } = globalThis as GlobalWithProcess
  if (process?.platform !== 'win32' || !filePath.startsWith('/')) {
    return filePath
  }
  if (/^\/[a-z]:\//i.test(filePath)) {
    return filePath.slice(1).replaceAll('/', '\\')
  }
  const currentDirectory = process.cwd?.() ?? ''
  const drive = /^[a-z]:/i.exec(currentDirectory)?.[0] ?? 'C:'
  return `${drive}${filePath.replaceAll('/', '\\')}`
}

const createModernEngine = (
  Eslint: EslintConstructor,
  baseDirectory: string,
  config: any[],
): InstanceType<EslintConstructor> => {
  const options = {
    applySuppressions: false,
    cwd: baseDirectory,
    overrideConfig: config,
    overrideConfigFile: true as const,
  }
  try {
    return new Eslint(options)
  } catch (error) {
    if (
      error instanceof Error &&
      /applySuppressions/.test(error.message) &&
      /unknown|invalid/i.test(error.message)
    ) {
      const { applySuppressions: _applySuppressions, ...legacyOptions } =
        options
      return new Eslint(legacyOptions)
    }
    throw error
  }
}

const createContextFromLoadedConfig = (
  loadedConfig: any,
  baseDirectory: string,
  eslint: EslintModule,
): LintContext => {
  const config = Array.isArray(loadedConfig) ? loadedConfig : [loadedConfig]
  if (
    typeof eslint.ESLint === 'function' &&
    getMajorVersion(eslint.ESLint) >= 9
  ) {
    return {
      engine: createModernEngine(eslint.ESLint, baseDirectory, config),
      type: 'modern',
    }
  }
  if (typeof eslint.Linter !== 'function') {
    throw new TypeError('Project ESLint module does not export Linter')
  }
  return {
    config,
    engine: new eslint.Linter({
      configType: 'flat',
      cwd: baseDirectory,
    }),
    type: 'legacy',
  }
}

const createContext = (
  graph: EvaluatedModuleGraph | undefined,
  baseDirectory: string,
  eslint: EslintModule,
): LintContext => {
  const loadedConfig = graph ? graph.exports : defaultConfig
  return createContextFromLoadedConfig(loadedConfig, baseDirectory, eslint)
}

const getContextMap = (
  graph: EvaluatedModuleGraph | undefined,
  baseDirectory: string,
): WeakMap<EslintModule, LintContext> => {
  const contexts = graph ? graphContexts : defaultContexts
  const key = graph?.id ?? baseDirectory
  let contextMap = contexts.get(key)
  if (!contextMap) {
    contextMap = new WeakMap()
    contexts.set(key, contextMap)
  }
  return contextMap
}

const getContext = (
  graph: EvaluatedModuleGraph | undefined,
  baseDirectory: string,
  eslint: EslintModule,
): LintContext => {
  const contexts = getContextMap(graph, baseDirectory)
  const cached = contexts.get(eslint)
  if (cached) {
    return cached
  }
  const context = createContext(graph, baseDirectory, eslint)
  contexts.set(eslint, context)
  return context
}

const lintWithContext = async (
  context: LintContext,
  text: string,
  filePath: string,
): Promise<readonly LintMessage[]> => {
  if (context.type === 'modern') {
    const results = await context.engine.lintText(text, {
      filePath,
      warnIgnored: false,
    })
    return results[0]?.messages ?? []
  }
  return context.engine.verify(text, context.config, { filename: filePath })
}

const toLintResults = (
  messages: readonly LintMessage[],
  linterFilePath: string,
  loadedSuppressions?: LoadedSuppressions,
): LintResult[] => {
  const unsuppressedMessages = ApplySuppressions.applySuppressions(
    messages,
    linterFilePath,
    loadedSuppressions,
  )
  return unsuppressedMessages
    .filter((message) => !isNoMatchingConfigMessage(message))
    .map((message) => ({
      column: message.column,
      endColumn: message.endColumn ?? undefined,
      endLine: message.endLine ?? undefined,
      ...(message.fix && {
        fix: {
          range: message.fix.range,
          text: message.fix.text,
        },
      }),
      line: message.line,
      message: message.message,
      ruleId: message.ruleId,
      severity: message.severity === 2 ? 'error' : 'warning',
    }))
}

const getLintPaths = (
  filePath: string,
  graph: EvaluatedModuleGraph | undefined,
): {
  readonly linterFilePath: string
  readonly nativeBaseDirectory: string
  readonly nativeLinterFilePath: string
} => {
  const linterFilePath = Path.toFileSystemPath(filePath)
  const nativeLinterFilePath = toNativeAbsolutePath(linterFilePath)
  const baseDirectory = graph
    ? Path.dirname(Path.toFileSystemPath(graph.entry))
    : Path.dirname(linterFilePath)
  return {
    linterFilePath,
    nativeBaseDirectory: toNativeAbsolutePath(baseDirectory),
    nativeLinterFilePath,
  }
}

export const lint = async (
  text: string,
  filePath: string,
  graph: EvaluatedModuleGraph | undefined,
  eslint: EslintModule,
  loadedSuppressions?: LoadedSuppressions,
): Promise<LintResult[]> => {
  const { linterFilePath, nativeBaseDirectory, nativeLinterFilePath } =
    getLintPaths(filePath, graph)
  const context = getContext(graph, nativeBaseDirectory, eslint)
  const messages = await lintWithContext(context, text, nativeLinterFilePath)
  return toLintResults(messages, linterFilePath, loadedSuppressions)
}

export const lintWithStats = async (
  text: string,
  filePath: string,
  graph: EvaluatedModuleGraph | undefined,
  eslint: EslintModule,
  loadedSuppressions?: LoadedSuppressions,
): Promise<LintPerformanceTrace> => {
  const { linterFilePath, nativeBaseDirectory, nativeLinterFilePath } =
    getLintPaths(filePath, graph)
  const configEvaluationStart = now()
  let context: LintContext
  try {
    const loadedConfig = graph ? graph.exports : defaultConfig
    context = createContextFromLoadedConfig(
      loadedConfig,
      nativeBaseDirectory,
      eslint,
    )
  } catch (error) {
    return {
      configEvaluation: {
        durationMs: now() - configEvaluationStart,
      },
      error: {
        details: toErrorDetails(error),
        stage: 'configEvaluation',
      },
    }
  }
  const configEvaluation = {
    durationMs: now() - configEvaluationStart,
  }
  const lintStart = now()
  try {
    const messages = await lintWithContext(context, text, nativeLinterFilePath)
    const diagnostics = toLintResults(
      messages,
      linterFilePath,
      loadedSuppressions,
    )
    return {
      configEvaluation,
      lint: {
        diagnosticCount: diagnostics.length,
        diagnostics,
        durationMs: now() - lintStart,
      },
    }
  } catch (error) {
    return {
      configEvaluation,
      error: {
        details: toErrorDetails(error),
        stage: 'lint',
      },
      lint: {
        diagnosticCount: 0,
        diagnostics: [],
        durationMs: now() - lintStart,
      },
    }
  }
}
