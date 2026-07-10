import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

export const activate = () => {
  // @ts-ignore
  vscode.registerCommand({
    execute: ExtensionHostDiagnosticProviderEslint.provideDiagnostics,
    id: 'eslint.lint',
    label: 'ESLint: Lint Document',
  })
  for (const languageId of ['javascript', 'typescript']) {
    // @ts-ignore
    vscode.registerDiagnosticProvider({
      ...ExtensionHostDiagnosticProviderEslint,
      id: `eslint.${languageId}`,
      languageId,
    })
  }
}

export const deactivate = () => {}
