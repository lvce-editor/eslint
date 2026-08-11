import {
  executeCommand,
  type FileChanges,
  registerFileChangeHandler,
} from '@lvce-editor/api'
import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as ModuleResolutionWorker from '../ModuleResolutionWorker/ModuleResolutionWorker.ts'

type InvalidateForFileChanges = (
  changes: Readonly<FileChanges>,
) => boolean | Promise<boolean>
type UpdateAllDiagnostics = () => Promise<unknown>
type ClearCaches = () => void | Promise<void>

export const handleFileChangesWithDependencies = async (
  changes: Readonly<FileChanges>,
  invalidateForFileChanges: InvalidateForFileChanges,
  updateAllDiagnostics: UpdateAllDiagnostics,
  clearCaches: ClearCaches = () => {},
): Promise<void> => {
  if (!(await invalidateForFileChanges(changes))) {
    return
  }
  await clearCaches()
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
  )
}

export const register = (): void => {
  registerFileChangeHandler(handleFileChanges)
}
