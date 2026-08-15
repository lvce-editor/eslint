import {
  executeCommand,
  type FileChanges,
  registerFileChangeHandler,
} from '@lvce-editor/api'
import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as LoadSuppressions from '../LoadSuppressions/LoadSuppressions.ts'
import * as ModuleResolutionWorker from '../ModuleResolutionWorker/ModuleResolutionWorker.ts'

type InvalidateForFileChanges = (
  changes: Readonly<FileChanges>,
) => boolean | Promise<boolean>
type UpdateAllDiagnostics = () => Promise<unknown>
type ClearCaches = () => void | Promise<void>
type InvalidateDiscoveryCaches = (changes: Readonly<FileChanges>) => boolean

const getChangedPaths = (changes: Readonly<FileChanges>): readonly string[] => {
  return [
    ...(changes.changed ?? []),
    ...(changes.deleted ?? []),
    ...(changes.renamed ?? []).flat(),
  ]
}

const getFileName = (path: string): string => {
  return path.slice(path.lastIndexOf('/') + 1)
}

const invalidateDiscoveryCaches = (changes: Readonly<FileChanges>): boolean => {
  const changedFileNames = getChangedPaths(changes).map(getFileName)
  const configChanged = changedFileNames.includes('eslint.config.js')
  const suppressionsChanged = changedFileNames.includes(
    'eslint-suppressions.json',
  )
  if (configChanged) {
    FindEslintConfig.clearCache()
  }
  if (configChanged || suppressionsChanged) {
    LoadSuppressions.clearCache()
  }
  return configChanged || suppressionsChanged
}

export const handleFileChangesWithDependencies = async (
  changes: Readonly<FileChanges>,
  invalidateForFileChanges: InvalidateForFileChanges,
  updateAllDiagnostics: UpdateAllDiagnostics,
  clearCaches: ClearCaches = () => {},
  invalidateCachedDiscovery: InvalidateDiscoveryCaches = () => false,
): Promise<void> => {
  const discoveryInvalidated = invalidateCachedDiscovery(changes)
  const moduleGraphInvalidated = await invalidateForFileChanges(changes)
  if (!discoveryInvalidated && !moduleGraphInvalidated) {
    return
  }
  if (moduleGraphInvalidated) {
    await clearCaches()
  }
  await updateAllDiagnostics()
}

const updateAllDiagnostics = async (): Promise<unknown> => {
  return executeCommand('GetActiveEditor.updateAllDiagnostics')
}

const handleFileChanges = async (
  changes: Readonly<FileChanges>,
): Promise<void> => {
  await handleFileChangesWithDependencies(
    changes,
    ModuleResolutionWorker.invalidateForFileChanges,
    updateAllDiagnostics,
    EslintEvaluationWorker.clearCache,
    invalidateDiscoveryCaches,
  )
}

export const register = (): void => {
  registerFileChangeHandler(handleFileChanges)
}
