import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as ModuleGraphCache from '../src/parts/ModuleGraphCache/ModuleGraphCache.ts'

const cacheEntries = new Map<string, Response>()
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
const hashes: Readonly<Record<string, string>> = {
  'file:///workspace/data.json':
    '48208f9428d64634bd8e28ff345bf0eab60d53c18fa2fbdb0b9bc1e84df2b5f6',
  'file:///workspace/eslint.config.js':
    '3a5910661bd79b2a6b41d83a225b9d8556bdaa62d1991417e199efb7121b1276',
}
const getFileHashes = jest.fn(async (uris: readonly string[]) =>
  uris.map((uri) => hashes[uri] ?? null),
)

beforeEach(() => {
  cacheEntries.clear()
  jest.clearAllMocks()
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
  FileSystem.state.api = {
    getFileHashes,
    readDirWithFileTypes: async () => [],
    readFile: async () => '',
    stat: async () => ({ isDirectory: false, isFile: false }),
  }
})

test('saves file uris and hashes separately from shared file content', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: { '/workspace/data.json': '{"value":1}' },
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    resolutions: {
      '/workspace/eslint.config.js\0./data.json': '/workspace/data.json',
    },
  })

  expect(getFileHashes).toHaveBeenCalledWith([
    'file:///workspace/eslint.config.js',
    'file:///workspace/data.json',
  ])
  expect(open).toHaveBeenCalledWith('eslint-config-files-cache')
  const response = cacheEntries.get(
    'https://eslint-config-files-cache.invalid/module%3Afile%3A%2F%2F%2Fworkspace%2Feslint.config.js',
  )
  await expect(response?.json()).resolves.toEqual({
    entry: 'file:///workspace/eslint.config.js',
    files: [
      {
        hash: hashes['file:///workspace/data.json'],
        uri: 'file:///workspace/data.json',
      },
    ],
    modules: [
      {
        hash: hashes['file:///workspace/eslint.config.js'],
        uri: 'file:///workspace/eslint.config.js',
      },
    ],
    resolutions: {
      'file:///workspace/eslint.config.js\0./data.json':
        'file:///workspace/data.json',
    },
    version: 2,
  })
})

test('restores sources after validating every hash in one request', async () => {
  cacheEntries.set(
    'https://eslint-config-files-cache.invalid/module%3Afile%3A%2F%2F%2Fworkspace%2Feslint.config.js',
    Response.json({
      entry: 'file:///workspace/eslint.config.js',
      files: [
        {
          hash: hashes['file:///workspace/data.json'],
          uri: 'file:///workspace/data.json',
        },
      ],
      modules: [
        {
          hash: hashes['file:///workspace/eslint.config.js'],
          uri: 'file:///workspace/eslint.config.js',
        },
      ],
      resolutions: {
        'file:///workspace/eslint.config.js\0./data.json':
          'file:///workspace/data.json',
      },
      version: 2,
    }),
  )
  cacheEntries.set(
    `https://eslint-file-cache.invalid/${hashes['file:///workspace/eslint.config.js']}`,
    new Response('module.exports = []'),
  )
  cacheEntries.set(
    `https://eslint-file-cache.invalid/${hashes['file:///workspace/data.json']}`,
    new Response('{"value":1}'),
  )

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toEqual({
    entry: '/workspace/eslint.config.js',
    files: { '/workspace/data.json': '{"value":1}' },
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    resolutions: {
      '/workspace/eslint.config.js\0./data.json': '/workspace/data.json',
    },
  })
  expect(getFileHashes).toHaveBeenCalledTimes(1)
  expect(getFileHashes).toHaveBeenCalledWith([
    'file:///workspace/eslint.config.js',
    'file:///workspace/data.json',
  ])
})

test('does not restore a graph when one file changed', async () => {
  cacheEntries.set(
    'https://eslint-config-files-cache.invalid/module%3Afile%3A%2F%2F%2Fworkspace%2Feslint.config.js',
    Response.json({
      entry: 'file:///workspace/eslint.config.js',
      files: [],
      modules: [
        { hash: 'old-hash', uri: 'file:///workspace/eslint.config.js' },
      ],
      resolutions: {},
      version: 2,
    }),
  )
  getFileHashes.mockResolvedValueOnce(['new-hash'])

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toBeUndefined()
  expect(match).toHaveBeenCalledTimes(1)
})

test('does not restore the path-based cache schema', async () => {
  cacheEntries.set(
    'https://eslint-config-files-cache.invalid/module%3Afile%3A%2F%2F%2Fworkspace%2Feslint.config.js',
    Response.json({
      entry: '/workspace/eslint.config.js',
      files: [],
      modules: [{ hash: 'old-hash', path: '/workspace/eslint.config.js' }],
      resolutions: {},
      version: 1,
    }),
  )

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toBeUndefined()
  expect(getFileHashes).not.toHaveBeenCalled()
})

test('does not save a graph when a file changes between reading and hashing', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = changed' },
    resolutions: {},
  })

  expect(put).not.toHaveBeenCalled()
})

test('does not restore content that does not match its content hash', async () => {
  const hash = hashes['file:///workspace/eslint.config.js']
  cacheEntries.set(
    'https://eslint-config-files-cache.invalid/module%3Afile%3A%2F%2F%2Fworkspace%2Feslint.config.js',
    Response.json({
      entry: 'file:///workspace/eslint.config.js',
      files: [],
      modules: [{ hash, uri: 'file:///workspace/eslint.config.js' }],
      resolutions: {},
      version: 2,
    }),
  )
  cacheEntries.set(
    `https://eslint-file-cache.invalid/${hash}`,
    new Response('corrupt content'),
  )

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toBeUndefined()
})
