import * as ExtensionHostDiagnosticProviderEslint from '../ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'

const languageIds = ['javascript', 'typescript', 'yaml']

export const getDiagnosticProviders = () => {
  return languageIds.map((languageId) => ({
    ...ExtensionHostDiagnosticProviderEslint,
    id: `eslint.${languageId}`,
    languageId,
  }))
}
