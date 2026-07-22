import { Linter } from 'eslint'
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
): Promise<LintResult[]> => {
  const loadedConfig = graph
    ? await LoadModuleGraph.loadModuleGraph(graph)
    : defaultConfig
  const config = Array.isArray(loadedConfig) ? loadedConfig : [loadedConfig]
  const linter = new Linter({ configType: 'flat' })
  const baseDirectory = graph
    ? Path.dirname(graph.entry)
    : Path.dirname(filePath)
  const relativeFilePath = Path.relative(baseDirectory, filePath)
  const messages = linter.verify(text, config, { filename: relativeFilePath })
  return messages.map((message) => ({
    column: message.column,
    endColumn: message.endColumn ?? undefined,
    endLine: message.endLine ?? undefined,
    line: message.line,
    message: message.message,
    ruleId: message.ruleId,
    severity: message.severity === 2 ? 'error' : 'warning',
  }))
}
