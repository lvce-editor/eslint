import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

export const activate = () => {
  // @ts-ignore
  vscode.registerDiagnosticProvider({
    ...ExtensionHostDiagnosticProviderEslint,
    languageId: 'javascript',
  })
  console.log('did register')
}

export const deactivate = () => {}
