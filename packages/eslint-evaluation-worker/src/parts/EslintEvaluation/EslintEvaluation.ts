import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { LintResult } from '../Lint/Lint.ts'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as ModuleResolution from '../ModuleResolution/ModuleResolution.ts'

interface Dependencies {
  readonly loadEslintConfig: typeof ModuleResolution.loadEslintConfig
  readonly loadEslintModule: typeof ModuleResolution.loadEslintModule
}

const defaultDependencies: Dependencies = {
  loadEslintConfig: ModuleResolution.loadEslintConfig,
  loadEslintModule: ModuleResolution.loadEslintModule,
}

const configGraphs = new Map<string, Promise<ModuleGraph>>()
const eslintGraphs = new Map<string, Promise<ModuleGraph>>()

const getOrLoadGraph = (
  cache: Map<string, Promise<ModuleGraph>>,
  key: string,
  load: () => Promise<ModuleGraph>,
): Promise<ModuleGraph> => {
  let graph = cache.get(key)
  if (!graph) {
    graph = load()
    cache.set(key, graph)
    void graph.catch(() => {
      if (cache.get(key) === graph) {
        cache.delete(key)
      }
    })
  }
  return graph
}

export const clearCache = (): void => {
  configGraphs.clear()
  eslintGraphs.clear()
  Lint.clearCache()
  LoadEslint.clearCache()
}

export const lintWithDependencies = async (
  text: string,
  filePath: string,
  configPath: string | undefined,
  loadedSuppressions: LoadedSuppressions | undefined,
  dependencies: Dependencies,
): Promise<LintResult[]> => {
  const configGraph = configPath
    ? await getOrLoadGraph(configGraphs, `${configPath}\0${filePath}`, () =>
        dependencies.loadEslintConfig(configPath, filePath),
      )
    : undefined
  const eslintGraphKey = configPath ?? filePath
  const eslintGraph = await getOrLoadGraph(eslintGraphs, eslintGraphKey, () =>
    dependencies.loadEslintModule(filePath, configPath),
  )
  const eslint = LoadEslint.loadEslint(eslintGraph)
  return Lint.lint(text, filePath, configGraph, eslint, loadedSuppressions)
}

export const lint = async (
  text: string,
  filePath: string,
  configPath?: string,
  loadedSuppressions?: LoadedSuppressions,
): Promise<LintResult[]> => {
  return lintWithDependencies(
    text,
    filePath,
    configPath,
    loadedSuppressions,
    defaultDependencies,
  )
}
