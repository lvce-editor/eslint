import type { LanguageProvider } from '@lvce-editor/api'
import * as ExtensionHostCodeActionsProviderEslint from '../ExtensionHost/ExtensionHostCodeActionsProviderEslint.ts'

const languageIds = ['javascript', 'typescript', 'yaml', 'css', 'json']

export const getCodeActionProviders = (): readonly LanguageProvider[] => {
  return languageIds.map((languageId) => ({
    ...ExtensionHostCodeActionsProviderEslint,
    id: `eslint.codeActions.${languageId}`,
    languageId,
  }))
}
