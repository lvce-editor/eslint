import { expect, test } from '@jest/globals'
import * as GetDiagnosticProviders from '../src/parts/GetDiagnosticProviders/GetDiagnosticProviders.ts'

test('registers diagnostics for supported languages', () => {
  const providers = GetDiagnosticProviders.getDiagnosticProviders()

  expect(providers.map(({ id, languageId }) => ({ id, languageId }))).toEqual([
    { id: 'eslint.javascript', languageId: 'javascript' },
    { id: 'eslint.typescript', languageId: 'typescript' },
    { id: 'eslint.yaml', languageId: 'yaml' },
    { id: 'eslint.css', languageId: 'css' },
    { id: 'eslint.json', languageId: 'json' },
  ])
})
