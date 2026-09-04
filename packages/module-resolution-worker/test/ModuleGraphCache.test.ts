import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as ModuleGraphCache from '../src/parts/ModuleGraphCache/ModuleGraphCache.ts'

/* cspell:disable */

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
  'file:///workspace/lazy.js':
    'c4d1f14387e26733af8c5c17379fce7cf38440bc0bff2f5493aec14bf46cfd80',
  'file:///workspace/words.txt.gz':
    'f901eda57fd86d4239806fd4b76f64036c1c20711267a7bc776ab2aa45069b2a',
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

test('saves a compiled graph with portable uris', async () => {
  await ModuleGraphCache.save(
    'module:file:///workspace/eslint.config.js:file:///workspace/src/file.ts',
    {
      entry: '/workspace/eslint.config.js',
      files: { '/workspace/data.json': '{"value":1}' },
      lazyModules: { '/workspace/lazy.js': 'module.exports = true' },
      modules: { '/workspace/eslint.config.js': 'module.exports = []' },
      moduleSources: {
        '/workspace/eslint.config.js': 'module.exports = []',
      },
      resolutions: {
        '/workspace/eslint.config.js\0🦄': '/workspace/data.json',
      },
    },
  )

  expect(getFileHashes).toHaveBeenCalledWith([
    'file:///workspace/eslint.config.js',
    'file:///workspace/lazy.js',
    'file:///workspace/data.json',
  ])
  expect(open).toHaveBeenCalledWith('eslint-config-files-cache')
  const response = cacheEntries.get(
    'https://eslint-config-files-cache.invalid/module/file/workspace/eslint.config.js/file/workspace/src/file.ts',
  )
  const content = await response?.clone().text()
  expect(response?.headers.get('Content-Length')).toBe(
    String(new TextEncoder().encode(content).byteLength),
  )
  expect(response?.headers.get('Content-Type')).toBe('application/json')
  expect(Date.parse(response?.headers.get('Expires') || '')).toBeGreaterThan(
    Date.now(),
  )
  await expect(response?.json()).resolves.toEqual({
    entry: 'file:///workspace/eslint.config.js',
    files: [
      {
        hash: hashes['file:///workspace/data.json'],
        uri: 'file:///workspace/data.json',
      },
    ],
    lazyModules: [
      {
        hash: hashes['file:///workspace/lazy.js'],
        uri: 'file:///workspace/lazy.js',
      },
    ],
    modules: [
      {
        compiledHash:
          '3a5910661bd79b2a6b41d83a225b9d8556bdaa62d1991417e199efb7121b1276',
        hash: hashes['file:///workspace/eslint.config.js'],
        uri: 'file:///workspace/eslint.config.js',
      },
    ],
    revision: expect.any(String),
    version: 4,
  })
  const compiledResponse = cacheEntries.get(
    'https://eslint-compiled-module-graph.invalid/module/file/workspace/eslint.config.js/file/workspace/src/file.ts',
  )
  expect(
    Date.parse(compiledResponse?.headers.get('Expires') || ''),
  ).toBeGreaterThan(Date.now())
  await expect(compiledResponse?.json()).resolves.toEqual({
    entrySource: 'module.exports = []',
    files: [
      {
        source: '{"value":1}',
        uri: 'file:///workspace/data.json',
      },
    ],
    lazyModules: [
      {
        source: 'module.exports = true',
        uri: 'file:///workspace/lazy.js',
      },
    ],
    modules: [
      {
        source: 'module.exports = []',
        uri: 'file:///workspace/eslint.config.js',
      },
    ],
    resolutions: {
      'file:///workspace/eslint.config.js\0🦄': 'file:///workspace/data.json',
    },
    version: 2,
  })
})

test('restores a compiled graph after validating every hash in one request', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: { '/workspace/data.json': '{"value":1}' },
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = []',
    },
    resolutions: {
      '/workspace/eslint.config.js\0./data.json': '/workspace/data.json',
    },
  })
  getFileHashes.mockClear()
  match.mockClear()

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toEqual({
    entry: '/workspace/eslint.config.js',
    entrySource: 'module.exports = []',
    files: { '/workspace/data.json': '{"value":1}' },
    lazyModules: {},
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
  expect(match).toHaveBeenCalledTimes(2)
})

test('round-trips binary virtual files', async () => {
  const binaryFile = {
    content: 'H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==',
    encoding: 'base64' as const,
  }
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: { '/workspace/words.txt.gz': binaryFile },
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = []',
    },
    resolutions: {},
  })

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toEqual({
    entry: '/workspace/eslint.config.js',
    entrySource: 'module.exports = []',
    files: { '/workspace/words.txt.gz': binaryFile },
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    resolutions: {},
  })
})

test('restores compiled modules and files from batched cache records', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: { '/workspace/data.json': '{"value":1}' },
    lazyModules: {},
    modules: {
      '/workspace/eslint.config.js': 'exports.default = []',
    },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = []',
    },
    resolutions: {},
  })
  match.mockClear()

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toEqual({
    entry: '/workspace/eslint.config.js',
    entrySource: 'module.exports = []',
    files: { '/workspace/data.json': '{"value":1}' },
    lazyModules: {},
    modules: {
      '/workspace/eslint.config.js': 'exports.default = []',
    },
    resolutions: {},
  })
  expect(match).toHaveBeenCalledTimes(2)
})

test('does not restore a graph when one file changed', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: {},
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = []',
    },
    resolutions: {},
  })
  match.mockClear()
  getFileHashes.mockResolvedValueOnce(['new-hash'])

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toBeUndefined()
  expect(match).toHaveBeenCalledTimes(1)
})

test('does not restore the path-based cache schema', async () => {
  cacheEntries.set(
    'https://eslint-config-files-cache.invalid/module/file/workspace/eslint.config.js',
    Response.json({
      entry: '/workspace/eslint.config.js',
      files: [],
      modules: [{ hash: 'old-hash', path: '/workspace/eslint.config.js' }],
      resolutions: {},
      version: 1,
    }),
  )

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js:'),
  ).resolves.toBeUndefined()
  expect(getFileHashes).not.toHaveBeenCalled()
})

test('does not save a graph when a file changes between reading and hashing', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: {},
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = changed' },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = changed',
    },
    resolutions: {},
  })

  expect(put).not.toHaveBeenCalled()
})

test('does not restore content that does not match its content hash', async () => {
  await ModuleGraphCache.save('module:file:///workspace/eslint.config.js', {
    entry: '/workspace/eslint.config.js',
    files: {},
    lazyModules: {},
    modules: { '/workspace/eslint.config.js': 'module.exports = []' },
    moduleSources: {
      '/workspace/eslint.config.js': 'module.exports = []',
    },
    resolutions: {},
  })
  cacheEntries.set(
    'https://eslint-compiled-module-graph.invalid/module/file/workspace/eslint.config.js',
    Response.json({
      entrySource: 'module.exports = []',
      files: [],
      modules: [
        {
          source: 'corrupt content',
          uri: 'file:///workspace/eslint.config.js',
        },
      ],
      resolutions: {},
      version: 1,
    }),
  )

  await expect(
    ModuleGraphCache.restore('module:file:///workspace/eslint.config.js'),
  ).resolves.toBeUndefined()
})
