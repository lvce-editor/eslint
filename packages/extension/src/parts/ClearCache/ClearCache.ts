import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as LintResultCache from '../LintResultCache/LintResultCache.ts'
import * as LoadSuppressions from '../LoadSuppressions/LoadSuppressions.ts'
import * as ModuleResolutionWorker from '../ModuleResolutionWorker/ModuleResolutionWorker.ts'

const CacheNamePrefix = 'eslint-'

interface Dependencies {
  readonly clearConfigDiscoveryCache: () => void
  readonly clearEvaluationCache: () => Promise<void>
  readonly clearFileHashCache: () => void
  readonly clearLintResultCache: () => void
  readonly clearModuleResolutionCache: () => void
  readonly clearSuppressionsCache: () => void
  readonly deleteCache: (name: string) => Promise<boolean>
  readonly getCacheNames: () => Promise<readonly string[]>
}

const defaultDependencies: Dependencies = {
  clearConfigDiscoveryCache: FindEslintConfig.clearCache,
  clearEvaluationCache: EslintEvaluationWorker.clearCache,
  clearFileHashCache: FileSystem.clearFileHashCache,
  clearLintResultCache: LintResultCache.clearCache,
  clearModuleResolutionCache: ModuleResolutionWorker.clearCache,
  clearSuppressionsCache: LoadSuppressions.clearCache,
  deleteCache: (name) => caches.delete(name),
  getCacheNames: () => caches.keys(),
}

const clearPersistentCaches = async (
  dependencies: Dependencies,
): Promise<void> => {
  const cacheNames = await dependencies.getCacheNames()
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(CacheNamePrefix))
      .map((name) => dependencies.deleteCache(name)),
  )
}

export const clearCacheWithDependencies = async (
  dependencies: Dependencies,
): Promise<void> => {
  dependencies.clearConfigDiscoveryCache()
  dependencies.clearFileHashCache()
  dependencies.clearLintResultCache()
  dependencies.clearModuleResolutionCache()
  dependencies.clearSuppressionsCache()
  await Promise.all([
    dependencies.clearEvaluationCache(),
    clearPersistentCaches(dependencies),
  ])
}

export const clearCache = (): Promise<void> => {
  return clearCacheWithDependencies(defaultDependencies)
}
