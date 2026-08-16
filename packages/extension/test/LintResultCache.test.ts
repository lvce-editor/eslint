import { beforeEach, expect, jest, test } from '@jest/globals'
import * as ComputeTextHash from '../src/parts/ComputeTextHash/ComputeTextHash.ts'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as LintResultCache from '../src/parts/LintResultCache/LintResultCache.ts'

const cacheEntries = new Map<string, Response>()
const hashes = new Map<string, string>([
  ['file:///workspace/eslint.config.js', 'config-source-hash'],
  ['file:///workspace/node_modules/eslint/index.js', 'eslint-source-hash'],
])
const getRequestKey = (key: string | Request): string =>
  typeof key === 'string' ? key : key.url
const match = jest.fn(async (key: string | Request) =>
  cacheEntries.get(getRequestKey(key))?.clone(),
)
const put = jest.fn(async (key: string | Request, response: Response) => {
  cacheEntries.set(getRequestKey(key), response.clone())
})
const open = jest.fn(
  async (_cacheName: string) => ({ match, put }) as unknown as Cache,
)
const getFileHashes = jest.fn(async (uris: readonly string[]) =>
  uris.map((uri) => hashes.get(uri) ?? null),
)

const setGraph = async (
  cacheKey: string,
  entry: string,
  uri: string,
): Promise<void> => {
  const revisionInput = {
    entry,
    files: [],
    modules: [
      {
        compiledHash: `compiled-${hashes.get(uri)}`,
        hash: hashes.get(uri),
        uri,
      },
    ],
    version: 3,
  }
  const revision = await ComputeTextHash.computeTextHash(
    JSON.stringify(revisionInput),
  )
  cacheEntries.set(
    `https://eslint-config-files-cache.invalid/${encodeURIComponent(cacheKey)}`,
    Response.json({ ...revisionInput, revision }),
  )
}

const setProjectGraphs = async (): Promise<void> => {
  await Promise.all([
    setGraph(
      'module:file:///workspace/eslint.config.js:file:///workspace/src/file.ts',
      'file:///workspace/eslint.config.js',
      'file:///workspace/eslint.config.js',
    ),
    setGraph(
      'commonjs-project:file:///workspace/eslint.config.js',
      'file:///workspace/node_modules/eslint/index.js',
      'file:///workspace/node_modules/eslint/index.js',
    ),
  ])
}

beforeEach(() => {
  cacheEntries.clear()
  hashes.set('file:///workspace/eslint.config.js', 'config-source-hash')
  jest.clearAllMocks()
  LintResultCache.clearRevisionCache()
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
  FileSystem.state.api = {
    getFileHashes,
    readDirWithFileTypes: async () => [],
    readFile: async () => '',
    stat: async () => 0,
  }
})

test('restores an unchanged lint result without revalidating warm graph revisions', async () => {
  await setProjectGraphs()
  const results = [
    {
      column: 1,
      line: 1,
      message: 'Unexpected var.',
      ruleId: 'no-var',
      severity: 'error' as const,
    },
  ]

  await LintResultCache.save(
    'var value = 1',
    '/workspace/src/file.ts',
    '/workspace/eslint.config.js',
    undefined,
    results,
  )

  await expect(
    LintResultCache.restore(
      'var value = 1',
      '/workspace/src/file.ts',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toEqual(results)
  expect(getFileHashes).toHaveBeenCalledTimes(2)
  expect(open).toHaveBeenCalledWith('eslint-lint-result-v1')
})

test('does not restore diagnostics for different editor text', async () => {
  await setProjectGraphs()
  await LintResultCache.save(
    'var value = 1',
    '/workspace/src/file.ts',
    '/workspace/eslint.config.js',
    undefined,
    [],
  )

  await expect(
    LintResultCache.restore(
      'const value = 1',
      '/workspace/src/file.ts',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toBeUndefined()
})

test('does not restore diagnostics after a config dependency changes', async () => {
  await setProjectGraphs()
  await LintResultCache.save(
    'var value = 1',
    '/workspace/src/file.ts',
    '/workspace/eslint.config.js',
    undefined,
    [],
  )
  LintResultCache.clearRevisionCache()
  hashes.set('file:///workspace/eslint.config.js', 'changed-config-hash')

  await expect(
    LintResultCache.restore(
      'var value = 1',
      '/workspace/src/file.ts',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toBeUndefined()
})

test('retries a missing graph revision after the graph is populated', async () => {
  await expect(
    LintResultCache.restore(
      'var value = 1',
      '/workspace/src/file.ts',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toBeUndefined()

  await setProjectGraphs()
  await LintResultCache.save(
    'var value = 1',
    '/workspace/src/file.ts',
    '/workspace/eslint.config.js',
    undefined,
    [],
  )
  await expect(
    LintResultCache.restore(
      'var value = 1',
      '/workspace/src/file.ts',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toEqual([])
})
