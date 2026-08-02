import {
  activate as activateExtensionApi,
  registerCommand,
  registerDiagnosticProvider,
} from '@lvce-editor/api'
import * as GetDiagnosticProviders from '../GetDiagnosticProviders/GetDiagnosticProviders.ts'
import * as HandleFileChanges from '../HandleFileChanges/HandleFileChanges.ts'
import * as LintDocument from '../LintDocument/LintDocument.ts'

const state = {
  isActivated: false,
}

export const activate = async (): Promise<void> => {
  if (state.isActivated) {
    return
  }
  state.isActivated = true
  await activateExtensionApi()
  HandleFileChanges.register()
  registerCommand({
    execute: LintDocument.lintDocument,
    id: 'eslint.lint',
  })
  for (const provider of GetDiagnosticProviders.getDiagnosticProviders()) {
    registerDiagnosticProvider(provider)
  }
}

export const deactivate = (): void => {}
