import type { LanguageProvider } from '@lvce-editor/api'
import * as ExtensionHostCodeActionsProviderEslint from '../ExtensionHost/ExtensionHostCodeActionsProviderEslint.ts'

const languageIds = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'yaml',
  'css',
  'json',
]

export const getCodeActionProviders = (): readonly LanguageProvider[] => {
  return languageIds.map((languageId) => ({
    ...ExtensionHostCodeActionsProviderEslint,
    id: `eslint.codeActions.${languageId}`,
    languageId,
  }))
}
