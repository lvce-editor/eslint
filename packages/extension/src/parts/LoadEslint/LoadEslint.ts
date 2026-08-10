import type { LinterConstructor } from '../Lint/Lint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'
import * as LoadModuleGraph from '../LoadModuleGraph/LoadModuleGraph.ts'

interface EslintModule {
  readonly Linter?: LinterConstructor
}

const loadedModules = new Map<string, EslintModule>()

export const clearCache = (): void => {
  loadedModules.clear()
}

export const loadEslint = async (
  filePath: string,
  projectPath?: string,
): Promise<LinterConstructor> => {
  const graph = await LoadEslintConfig.loadEslintModule(filePath, projectPath)
  let eslint = loadedModules.get(graph.id)
  if (!eslint) {
    eslint = LoadModuleGraph.loadModuleGraph(graph) as EslintModule
    loadedModules.set(graph.id, eslint)
  }
  if (typeof eslint.Linter !== 'function') {
    throw new TypeError(
      `Project ESLint module does not export Linter: ${graph.entry}`,
    )
  }
  return eslint.Linter
}
