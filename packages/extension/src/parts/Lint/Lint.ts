import type { Linter } from 'eslint'
import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as ApplySuppressions from '../ApplySuppressions/ApplySuppressions.ts'
import * as LoadModuleGraph from '../LoadModuleGraph/LoadModuleGraph.ts'
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

export type LinterConstructor = typeof Linter

type LintMessage = ReturnType<InstanceType<LinterConstructor>['verify']>[number]

type LintContext = {
  readonly config: any[]
  readonly linter: InstanceType<LinterConstructor>
}

const graphContexts = new WeakMap<
  ModuleGraph,
  WeakMap<LinterConstructor, LintContext>
>()

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

const createContext = (
  graph: ModuleGraph | undefined,
  baseDirectory: string,
  Linter: LinterConstructor,
): LintContext => {
  const loadedConfig = graph
    ? LoadModuleGraph.loadModuleGraph(graph)
    : defaultConfig
  const config = Array.isArray(loadedConfig) ? loadedConfig : [loadedConfig]
  const linter = new Linter({
    configType: 'flat',
    cwd: baseDirectory,
  })
  return { config, linter }
}

const getContext = (
  graph: ModuleGraph | undefined,
  linterFilePath: string,
  Linter: LinterConstructor,
): LintContext => {
  if (!graph) {
    const baseDirectory = Path.dirname(linterFilePath)
    return createContext(graph, baseDirectory, Linter)
  }
  let contexts = graphContexts.get(graph)
  if (!contexts) {
    contexts = new WeakMap()
    graphContexts.set(graph, contexts)
  }
  const cached = contexts.get(Linter)
  if (cached) {
    return cached
  }
  const baseDirectory = Path.dirname(Path.toFileSystemPath(graph.entry))
  const context = createContext(graph, baseDirectory, Linter)
  contexts.set(Linter, context)
  return context
}

export const lint = async (
  text: string,
  filePath: string,
  graph: ModuleGraph | undefined,
  Linter: LinterConstructor,
  loadedSuppressions?: LoadedSuppressions,
): Promise<LintResult[]> => {
  const linterFilePath = Path.toFileSystemPath(filePath)
  const { config, linter } = getContext(graph, linterFilePath, Linter)
  const messages = linter.verify(text, config, { filename: linterFilePath })
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
