import {
  executeCommand,
  type FileChanges,
  registerFileChangeHandler,
} from '@lvce-editor/api'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

type InvalidateForFileChanges = (changes: Readonly<FileChanges>) => boolean
type UpdateAllDiagnostics = () => Promise<unknown>

export const handleFileChangesWithDependencies = async (
  changes: Readonly<FileChanges>,
  invalidateForFileChanges: InvalidateForFileChanges,
  updateAllDiagnostics: UpdateAllDiagnostics,
): Promise<void> => {
  if (!invalidateForFileChanges(changes)) {
    return
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
    LoadEslintConfig.invalidateForFileChanges,
    updateAllDiagnostics,
  )
}

export const register = (): void => {
  registerFileChangeHandler(handleFileChanges)
}
