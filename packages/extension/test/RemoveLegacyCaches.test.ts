import { expect, jest, test } from '@jest/globals'
import * as RemoveLegacyCaches from '../src/parts/RemoveLegacyCaches/RemoveLegacyCaches.ts'

test('removes obsolete caches without deleting current or unrelated caches', async () => {
  const names = new Set([
    'eslint-config-files-cache',
    'eslint-compiled-module-graph-v2',
    'eslint-module-analysis-v1',
    'eslint-module-analysis-v2',
    'eslint-module-analysis-v3',
    'eslint-file-content-v1',
    'eslint-compiled-module-graph-v3',
    'eslint-file-content-v2',
    'eslint-module-analysis-v4',
    'lvce-runtime',
  ])
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { delete: async (name: string) => names.delete(name) },
  })
  await RemoveLegacyCaches.removeLegacyCaches()
  expect([...names]).toEqual([
    'eslint-compiled-module-graph-v3',
    'eslint-file-content-v2',
    'eslint-module-analysis-v4',
    'lvce-runtime',
  ])
})

test('unavailable storage does not prevent activation', async () => {
  const deleteCache = jest
    .fn<CacheStorage['delete']>()
    .mockRejectedValue(new Error('unavailable'))
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { delete: deleteCache },
  })
  await expect(RemoveLegacyCaches.removeLegacyCaches()).resolves.toBeUndefined()
  expect(deleteCache).toHaveBeenCalledTimes(6)
})
