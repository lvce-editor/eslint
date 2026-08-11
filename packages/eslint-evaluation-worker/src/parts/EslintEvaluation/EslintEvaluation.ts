import type { LoadedSuppressions } from '../ApplySuppressions/ApplySuppressions.ts'
import type { LintResult } from '../Lint/Lint.ts'
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

export const clearCache = (): void => {
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
    ? await dependencies.loadEslintConfig(configPath, filePath)
    : undefined
  const eslintGraph = await dependencies.loadEslintModule(filePath, configPath)
  const Linter = LoadEslint.loadEslint(eslintGraph)
  return Lint.lint(text, filePath, configGraph, Linter, loadedSuppressions)
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
