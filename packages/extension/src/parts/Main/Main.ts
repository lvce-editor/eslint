import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

export const activate = () => {
  // @ts-ignore
  vscode.registerDiagnosticProvider({
    ...ExtensionHostDiagnosticProviderEslint,
    languageId: 'javascript',
  })
}

export const deactivate = () => {}
