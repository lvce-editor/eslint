import { expect, jest, test } from '@jest/globals'
import * as HandleFileChanges from '../src/parts/HandleFileChanges/HandleFileChanges.ts'

test('refreshes all diagnostics after an eslint config change', async () => {
  const invalidateForFileChanges = jest.fn<(changes: any) => boolean>(
    () => true,
  )
  const updateAllDiagnostics = jest.fn<() => Promise<void>>()
  const clearCaches = jest.fn<() => void>()
  updateAllDiagnostics.mockResolvedValue()
  const changes = {
    changed: ['file:///workspace/eslint.config.js'],
  }

  await HandleFileChanges.handleFileChangesWithDependencies(
    changes,
    invalidateForFileChanges,
    updateAllDiagnostics,
    clearCaches,
  )

  expect(invalidateForFileChanges).toHaveBeenCalledWith(changes)
  expect(clearCaches).toHaveBeenCalledWith()
  expect(updateAllDiagnostics).toHaveBeenCalledWith()
})

test('does not refresh diagnostics for an unrelated file change', async () => {
  const invalidateForFileChanges = jest.fn<(changes: any) => boolean>(
    () => false,
  )
  const updateAllDiagnostics = jest.fn<() => Promise<void>>()
  const clearCaches = jest.fn<() => void>()
  updateAllDiagnostics.mockResolvedValue()
  const changes = {
    changed: ['file:///workspace/readme.md'],
  }

  await HandleFileChanges.handleFileChangesWithDependencies(
    changes,
    invalidateForFileChanges,
    updateAllDiagnostics,
    clearCaches,
  )

  expect(invalidateForFileChanges).toHaveBeenCalledWith(changes)
  expect(clearCaches).not.toHaveBeenCalled()
  expect(updateAllDiagnostics).not.toHaveBeenCalled()
})

test('refreshes diagnostics for a cached discovery change without clearing the evaluation engine', async () => {
  const invalidateForFileChanges = jest.fn<(changes: any) => boolean>(
    () => false,
  )
  const invalidateDiscoveryCaches = jest.fn<(changes: any) => boolean>(
    () => true,
  )
  const updateAllDiagnostics = jest.fn(async () => undefined)
  const clearCaches = jest.fn<() => void>()
  const changes = {
    changed: ['file:///workspace/eslint-suppressions.json'],
  }

  await HandleFileChanges.handleFileChangesWithDependencies(
    changes,
    invalidateForFileChanges,
    updateAllDiagnostics,
    clearCaches,
    invalidateDiscoveryCaches,
  )

  expect(invalidateDiscoveryCaches).toHaveBeenCalledWith(changes)
  expect(clearCaches).not.toHaveBeenCalled()
  expect(updateAllDiagnostics).toHaveBeenCalledWith()
})
