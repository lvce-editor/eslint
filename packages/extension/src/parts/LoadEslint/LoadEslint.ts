import type { LinterConstructor } from '../Lint/Lint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'
import * as LoadModuleGraph from '../LoadModuleGraph/LoadModuleGraph.ts'

interface EslintModule {
  readonly Linter?: LinterConstructor
}

const loadedModules = new WeakMap<object, EslintModule>()

export const loadEslint = async (
  filePath: string,
): Promise<LinterConstructor> => {
  const entry = await LoadEslintConfig.resolveModule(filePath, 'eslint')
  if (!entry) {
    throw new Error(
      `Cannot find ESLint in project node_modules for ${filePath}`,
    )
  }
  const graph = await LoadEslintConfig.loadModule(entry, true)
  let eslint = loadedModules.get(graph)
  if (!eslint) {
    eslint = LoadModuleGraph.loadModuleGraph(graph) as EslintModule
    loadedModules.set(graph, eslint)
  }
  if (typeof eslint.Linter !== 'function') {
    throw new TypeError(
      `Project ESLint module does not export Linter: ${entry}`,
    )
  }
  return eslint.Linter
}
