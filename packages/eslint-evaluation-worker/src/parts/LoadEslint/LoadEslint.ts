import type { LinterConstructor } from '../Lint/Lint.ts'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as LoadModuleGraph from '../LoadModuleGraph/LoadModuleGraph.ts'

interface EslintModule {
  readonly Linter?: LinterConstructor
}

const loadedModules = new Map<string, EslintModule>()

export const clearCache = (): void => {
  loadedModules.clear()
}

export const loadEslint = (graph: ModuleGraph): LinterConstructor => {
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
