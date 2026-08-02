import { executeCommand, type Diagnostic } from '@lvce-editor/api'
import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

export interface TextDocument {
  readonly text: string
  readonly uri: string
}

type UpdateDiagnostics = () => Promise<void>
type ProvideDiagnostics = (
  textDocument: TextDocument,
) => Promise<readonly Diagnostic[]>

export const lintDocumentWithDependencies = async (
  textDocument: TextDocument | undefined,
  updateDiagnostics: UpdateDiagnostics,
  provideDiagnostics: ProvideDiagnostics,
): Promise<readonly Diagnostic[]> => {
  if (!textDocument) {
    await updateDiagnostics()
    return []
  }
  return provideDiagnostics(textDocument)
}

const updateDiagnostics = async (): Promise<void> => {
  await executeCommand('GetActiveEditor.updateDiagnostics')
}

export const lintDocument = async (
  textDocument?: TextDocument,
): Promise<readonly Diagnostic[]> => {
  return lintDocumentWithDependencies(
    textDocument,
    updateDiagnostics,
    ExtensionHostDiagnosticProviderEslint.provideDiagnostics,
  )
}
