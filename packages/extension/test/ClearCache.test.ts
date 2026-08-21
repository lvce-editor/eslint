import { expect, jest, test } from '@jest/globals'
import * as ClearCache from '../src/parts/ClearCache/ClearCache.ts'

test('clears ESLint memory and persistent caches', async () => {
  const clearConfigDiscoveryCache = jest.fn<() => void>()
  const clearEvaluationCache = jest.fn(async () => {})
  const clearFileHashCache = jest.fn<() => void>()
  const clearLintResultCache = jest.fn<() => void>()
  const clearModuleResolutionCache = jest.fn<() => void>()
  const clearSuppressionsCache = jest.fn<() => void>()
  const deleteCache = jest.fn(async () => true)
  const getCacheNames = jest.fn(async () => [
    'eslint-file-content-v1',
    'other-extension-cache',
    'eslint-lint-result-v1',
  ])

  await ClearCache.clearCacheWithDependencies({
    clearConfigDiscoveryCache,
    clearEvaluationCache,
    clearFileHashCache,
    clearLintResultCache,
    clearModuleResolutionCache,
    clearSuppressionsCache,
    deleteCache,
    getCacheNames,
  })

  expect(clearConfigDiscoveryCache).toHaveBeenCalledTimes(1)
  expect(clearEvaluationCache).toHaveBeenCalledTimes(1)
  expect(clearFileHashCache).toHaveBeenCalledTimes(1)
  expect(clearLintResultCache).toHaveBeenCalledTimes(1)
  expect(clearModuleResolutionCache).toHaveBeenCalledTimes(1)
  expect(clearSuppressionsCache).toHaveBeenCalledTimes(1)
  expect(deleteCache.mock.calls).toEqual([
    ['eslint-file-content-v1'],
    ['eslint-lint-result-v1'],
  ])
})
