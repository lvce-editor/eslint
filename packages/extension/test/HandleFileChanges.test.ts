import { expect, jest, test } from '@jest/globals'
import * as HandleFileChanges from '../src/parts/HandleFileChanges/HandleFileChanges.ts'

test('refreshes all diagnostics after an eslint config change', async () => {
  const invalidateForFileChanges = jest.fn<(changes: any) => boolean>(
    () => true,
  )
  const updateAllDiagnostics = jest.fn<() => Promise<void>>()
  updateAllDiagnostics.mockResolvedValue()
  const changes = {
    changed: ['file:///workspace/eslint.config.js'],
  }

  await HandleFileChanges.handleFileChangesWithDependencies(
    changes,
    invalidateForFileChanges,
    updateAllDiagnostics,
  )

  expect(invalidateForFileChanges).toHaveBeenCalledWith(changes)
  expect(updateAllDiagnostics).toHaveBeenCalledWith()
})

test('does not refresh diagnostics for an unrelated file change', async () => {
  const invalidateForFileChanges = jest.fn<(changes: any) => boolean>(
    () => false,
  )
  const updateAllDiagnostics = jest.fn<() => Promise<void>>()
  updateAllDiagnostics.mockResolvedValue()
  const changes = {
    changed: ['file:///workspace/readme.md'],
  }

  await HandleFileChanges.handleFileChangesWithDependencies(
    changes,
    invalidateForFileChanges,
    updateAllDiagnostics,
  )

  expect(invalidateForFileChanges).toHaveBeenCalledWith(changes)
  expect(updateAllDiagnostics).not.toHaveBeenCalled()
})
