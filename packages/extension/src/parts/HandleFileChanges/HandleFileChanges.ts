import {
  executeCommand,
  type FileChanges,
  registerFileChangeHandler,
} from '@lvce-editor/api'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

type InvalidateForFileChanges = (
  changes: Readonly<FileChanges>,
) => boolean | Promise<boolean>
type UpdateAllDiagnostics = () => Promise<unknown>
type ClearCaches = () => void

export const handleFileChangesWithDependencies = async (
  changes: Readonly<FileChanges>,
  invalidateForFileChanges: InvalidateForFileChanges,
  updateAllDiagnostics: UpdateAllDiagnostics,
  clearCaches: ClearCaches = () => {},
): Promise<void> => {
  if (!(await invalidateForFileChanges(changes))) {
    return
  }
  clearCaches()
  await updateAllDiagnostics()
}

const updateAllDiagnostics = async (): Promise<unknown> => {
  return executeCommand('GetActiveEditor.updateAllDiagnostics')
}

const clearCaches = (): void => {
  Lint.clearCache()
  LoadEslint.clearCache()
}

const handleFileChanges = async (
  changes: Readonly<FileChanges>,
): Promise<void> => {
  await handleFileChangesWithDependencies(
    changes,
    LoadEslintConfig.invalidateForFileChanges,
    updateAllDiagnostics,
    clearCaches,
  )
}

export const register = (): void => {
  registerFileChangeHandler(handleFileChanges)
}
