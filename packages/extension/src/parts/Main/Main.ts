import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

export const activate = () => {
  for (const languageId of ['javascript', 'typescript']) {
    // @ts-ignore
    vscode.registerDiagnosticProvider({
      ...ExtensionHostDiagnosticProviderEslint,
      languageId,
    })
  }
}

export const deactivate = () => {}
