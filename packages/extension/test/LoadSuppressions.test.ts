import { beforeEach, expect, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as LoadSuppressions from '../src/parts/LoadSuppressions/LoadSuppressions.ts'

const state: { files: Record<string, string> } = { files: {} }

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname)

const readFile = async (uri: string): Promise<string> => {
  const path = toPath(uri)
  if (!(path in state.files)) {
    throw new Error(`File not found: ${path}`)
  }
  return state.files[path]
}

const readDirWithFileTypes = async (
  uri: string,
): Promise<Array<{ name: string; type: number }>> => {
  const path = toPath(uri).replace(/\/$/, '')
  const prefix = `${path}/`
  const entries = new Map<string, number>()
  for (const file of Object.keys(state.files)) {
    if (!file.startsWith(prefix)) {
      continue
    }
    const relative = file.slice(prefix.length)
    const slashIndex = relative.indexOf('/')
    const name = slashIndex === -1 ? relative : relative.slice(0, slashIndex)
    entries.set(name, slashIndex === -1 ? 7 : 3)
  }
  return Array.from(entries, ([name, type]) => ({ name, type }))
}

beforeEach(() => {
  state.files = {}
  LoadSuppressions.clearCache()
  FileSystem.state.api = {
    getFileHashes: async () => [],
    readDirWithFileTypes,
    readFile,
    stat: async () => 0,
  }
})

test('coalesces concurrent missing suppression searches', async () => {
  let directoryReads = 0
  FileSystem.state.api = {
    ...FileSystem.state.api,
    readDirWithFileTypes: async (uri) => {
      directoryReads++
      return readDirWithFileTypes(uri)
    },
  }
  state.files = { '/workspace/src/file.js': 'debugger' }

  await Promise.all([
    LoadSuppressions.loadSuppressions('/workspace/src/file.js', null),
    LoadSuppressions.loadSuppressions('/workspace/src/file.js', null),
  ])
  const firstSearchReads = directoryReads
  await LoadSuppressions.loadSuppressions('/workspace/src/file.js', null)

  expect(directoryReads).toBe(firstSearchReads)
})

test('loads eslint-suppressions.json beside the eslint config', async () => {
  state.files = {
    '/workspace/eslint-suppressions.json': JSON.stringify({
      'src/file.js': { 'no-debugger': { count: 1 } },
    }),
  }
  await expect(
    LoadSuppressions.loadSuppressions(
      '/workspace/src/file.js',
      '/workspace/eslint.config.js',
    ),
  ).resolves.toEqual({
    baseDirectory: '/workspace',
    suppressions: {
      'src/file.js': { 'no-debugger': { count: 1 } },
    },
  })
})

test('finds eslint-suppressions.json in an ancestor directory', async () => {
  state.files = {
    '/workspace/eslint-suppressions.json': '{}',
  }
  await expect(
    LoadSuppressions.loadSuppressions('/workspace/src/nested/file.js', null),
  ).resolves.toEqual({
    baseDirectory: '/workspace',
    suppressions: {},
  })
})

test('uses the nearest eslint-suppressions.json', async () => {
  state.files = {
    '/workspace/eslint-suppressions.json': '{"root.js":{}}',
    '/workspace/packages/app/eslint-suppressions.json': '{"file.js":{}}',
  }
  await expect(
    LoadSuppressions.loadSuppressions(
      '/workspace/packages/app/src/file.js',
      null,
    ),
  ).resolves.toEqual({
    baseDirectory: '/workspace/packages/app',
    suppressions: { 'file.js': {} },
  })
})

test('returns undefined when no suppressions file exists', async () => {
  state.files = {
    '/workspace/src/file.js': 'debugger',
  }
  await expect(
    LoadSuppressions.loadSuppressions('/workspace/src/file.js', null),
  ).resolves.toBeUndefined()
})

test('reports malformed suppression json with its path', async () => {
  state.files = {
    '/workspace/eslint-suppressions.json': '{',
  }
  await expect(
    LoadSuppressions.loadSuppressions('/workspace/file.js', null),
  ).rejects.toThrow(
    'Failed to parse suppressions file at /workspace/eslint-suppressions.json',
  )
})

test('supports virtual file system uris', async () => {
  state.files = {
    '/workspace/eslint-suppressions.json': '{}',
  }
  await expect(
    LoadSuppressions.loadSuppressions('memfs:///workspace/src/file.js', null),
  ).resolves.toEqual({
    baseDirectory: 'memfs:///workspace',
    suppressions: {},
  })
})
