import {
  activate as activateExtensionApi,
  registerCommand,
  registerDiagnosticProvider,
} from '@lvce-editor/api'
import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

const state = {
  isActivated: false,
}

export const activate = async (): Promise<void> => {
  if (state.isActivated) {
    return
  }
  state.isActivated = true
  await activateExtensionApi()
  registerCommand({
    execute: ExtensionHostDiagnosticProviderEslint.provideDiagnostics,
    id: 'eslint.lint',
  })
  for (const languageId of ['javascript', 'typescript']) {
    registerDiagnosticProvider({
      ...ExtensionHostDiagnosticProviderEslint,
      id: `eslint.${languageId}`,
      languageId,
    })
  }
}

export const deactivate = (): void => {}
