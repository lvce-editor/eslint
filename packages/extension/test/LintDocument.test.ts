import type { Diagnostic } from '@lvce-editor/api'
import { beforeEach, expect, jest, test } from '@jest/globals'
import * as LintDocument from '../src/parts/LintDocument/LintDocument.ts'

const updateDiagnostics = jest.fn<() => Promise<void>>()
const provideDiagnostics =
  jest.fn<
    (textDocument: LintDocument.TextDocument) => Promise<readonly Diagnostic[]>
  >()

beforeEach(() => {
  jest.clearAllMocks()
})

test('lints the supplied document', async () => {
  const document = {
    text: 'debugger',
    uri: 'file:///test.js',
  }
  const diagnostics: readonly Diagnostic[] = []
  provideDiagnostics.mockResolvedValue(diagnostics)

  await expect(
    LintDocument.lintDocumentWithDependencies(
      document,
      updateDiagnostics,
      provideDiagnostics,
    ),
  ).resolves.toBe(diagnostics)
  expect(updateDiagnostics).not.toHaveBeenCalled()
  expect(provideDiagnostics).toHaveBeenCalledWith(document)
})

test('refreshes the active document diagnostics when no document is supplied', async () => {
  updateDiagnostics.mockResolvedValue()

  await expect(
    LintDocument.lintDocumentWithDependencies(
      undefined,
      updateDiagnostics,
      provideDiagnostics,
    ),
  ).resolves.toEqual([])
  expect(updateDiagnostics).toHaveBeenCalledWith()
  expect(provideDiagnostics).not.toHaveBeenCalled()
})
