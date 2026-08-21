import { expect, test } from '@jest/globals'
import * as GetCodeActionProviders from '../src/parts/GetCodeActionProviders/GetCodeActionProviders.ts'

test('registers code actions for supported languages', () => {
  const providers = GetCodeActionProviders.getCodeActionProviders()

  expect(providers.map(({ id, languageId }) => ({ id, languageId }))).toEqual([
    { id: 'eslint.codeActions.javascript', languageId: 'javascript' },
    {
      id: 'eslint.codeActions.javascriptreact',
      languageId: 'javascriptreact',
    },
    { id: 'eslint.codeActions.typescript', languageId: 'typescript' },
    {
      id: 'eslint.codeActions.typescriptreact',
      languageId: 'typescriptreact',
    },
    { id: 'eslint.codeActions.yaml', languageId: 'yaml' },
    { id: 'eslint.codeActions.css', languageId: 'css' },
    { id: 'eslint.codeActions.json', languageId: 'json' },
  ])
})
