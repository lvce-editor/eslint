import type { LanguageProvider } from '@lvce-editor/api'
import * as ExtensionHostCodeActionsProviderEslint from '../ExtensionHost/ExtensionHostCodeActionsProviderEslint.ts'

const languageIds = ['javascript', 'typescript', 'yaml']

export const getCodeActionProviders = (): readonly LanguageProvider[] => {
  return languageIds.map((languageId) => ({
    ...ExtensionHostCodeActionsProviderEslint,
    id: `eslint.codeActions.${languageId}`,
    languageId,
  }))
}
