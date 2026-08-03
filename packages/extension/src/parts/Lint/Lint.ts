import type { Linter } from 'eslint'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
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

export const lint = async (
  text: string,
  filePath: string,
  graph: ModuleGraph | undefined,
  Linter: LinterConstructor,
): Promise<LintResult[]> => {
  const loadedConfig = graph
    ? await LoadModuleGraph.loadModuleGraph(graph)
    : defaultConfig
  const config = Array.isArray(loadedConfig) ? loadedConfig : [loadedConfig]
  const baseDirectory = graph
    ? Path.dirname(graph.entry)
    : Path.dirname(filePath)
  const linter = new Linter({ configType: 'flat', cwd: baseDirectory })
  const messages = linter.verify(text, config, { filename: filePath })
  return messages
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
