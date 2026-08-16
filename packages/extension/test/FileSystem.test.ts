import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'

const readDirWithFileTypes = jest.fn(async (_uri: string) => [
  { name: 'eslint.config.js', type: 7 },
])
const getFileHash = jest.fn(async (_uri: string) => 'content-hash')
const getFileHashes = jest.fn(
  async (uris: readonly string[]): Promise<readonly (string | null)[]> =>
    uris.map(() => 'content-hash'),
)
const readFile = jest.fn(async (_uri: string) => 'content')
const stat = jest.fn(async (_uri: string) => 7)
const getText = jest.fn(
  async (_hash: string): Promise<string | undefined> => undefined,
)
const setText = jest.fn(
  async (_hash: string, _content: string): Promise<void> => {},
)
const computeTextHash = jest.fn(async (_content: string) => 'content-hash')

beforeEach(() => {
  jest.clearAllMocks()
  FileSystem.state.api = {
    getFileHash,
    getFileHashes,
    readDirWithFileTypes,
    readFile,
    stat,
  }
  FileSystem.state.cache = {
    getText,
    setText,
  }
  FileSystem.state.computeTextHash = computeTextHash
  FileSystem.clearFileHashCache()
})

test('converts paths to canonical file uris', () => {
  expect(FileSystem.toUri('/workspace/a b#c?.js')).toBe(
    'file:///workspace/a%20b%23c%3F.js',
  )
  expect(FileSystem.toUri(String.raw`C:\workspace\a b.js`)).toBe(
    'file:///C:/workspace/a%20b.js',
  )
  expect(FileSystem.toUri(String.raw`\\server\share\a b.js`)).toBe(
    'file://server/share/a%20b.js',
  )
})

test('preserves non-file uris when canonicalizing', () => {
  expect(FileSystem.toUri('memfs:///workspace/a.js')).toBe(
    'memfs:///workspace/a.js',
  )
})

test('readFile converts an absolute path to a file uri', async () => {
  await expect(FileSystem.readFile('/workspace/a b.js')).resolves.toBe(
    'content',
  )
  expect(readFile).toHaveBeenCalledWith('file:///workspace/a%20b.js')
  expect(getFileHash).toHaveBeenCalledWith('file:///workspace/a%20b.js')
  expect(getText).toHaveBeenCalledWith('content-hash')
  expect(setText).toHaveBeenCalledWith('content-hash', 'content')
})

test('readFile returns cached content without reading the file again', async () => {
  getText.mockResolvedValueOnce('content')

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )

  expect(readFile).not.toHaveBeenCalled()
  expect(setText).not.toHaveBeenCalled()
})

test('getFileHashes batches uri hashing and primes subsequent content reads', async () => {
  getFileHashes.mockResolvedValueOnce(['content-hash', null])
  getText.mockResolvedValueOnce('content')

  await expect(
    FileSystem.getFileHashes(['/workspace/file.js', '/workspace/missing.js']),
  ).resolves.toEqual(['content-hash', null])
  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )

  expect(getFileHashes).toHaveBeenCalledWith([
    'file:///workspace/file.js',
    'file:///workspace/missing.js',
  ])
  expect(getFileHash).not.toHaveBeenCalled()
  expect(readFile).not.toHaveBeenCalled()
})

test('getFileHashes treats a failed batch as cache misses without individual requests', async () => {
  getFileHashes.mockRejectedValueOnce(new Error('Hashing unavailable'))

  await expect(
    FileSystem.getFileHashes(['/workspace/first.js', '/workspace/second.js']),
  ).resolves.toEqual([null, null])

  expect(getFileHash).not.toHaveBeenCalled()
})

test('readFile ignores a cache entry whose content does not match its hash', async () => {
  getText.mockResolvedValueOnce('stale content')
  computeTextHash
    .mockResolvedValueOnce('stale-content-hash')
    .mockResolvedValueOnce('content-hash')

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )

  expect(readFile).toHaveBeenCalledWith('file:///workspace/file.js')
  expect(setText).toHaveBeenCalledWith('content-hash', 'content')
})

test('readFile does not cache content when the file changes between hashing and reading', async () => {
  computeTextHash.mockResolvedValueOnce('changed-content-hash')
  readFile.mockResolvedValueOnce('changed content')

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'changed content',
  )

  expect(setText).not.toHaveBeenCalled()
})

test('readFile falls back to a direct read when hashing fails', async () => {
  getFileHash.mockRejectedValueOnce(new Error('Hashing unavailable'))

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )

  expect(getText).not.toHaveBeenCalled()
  expect(readFile).toHaveBeenCalledWith('file:///workspace/file.js')
})

test('readFile falls back to a direct read when Cache Storage fails', async () => {
  getText.mockRejectedValueOnce(new Error('Cache unavailable'))

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )

  expect(readFile).toHaveBeenCalledWith('file:///workspace/file.js')
})

test('readFile preserves the read result when writing Cache Storage fails', async () => {
  setText.mockRejectedValueOnce(new Error('Cache unavailable'))

  await expect(FileSystem.readFile('/workspace/file.js')).resolves.toBe(
    'content',
  )
})

test('readDirWithFileTypes converts an absolute path to a file uri', async () => {
  await expect(FileSystem.readDirWithFileTypes('/workspace')).resolves.toEqual([
    { isDirectory: false, isFile: true, name: 'eslint.config.js' },
  ])
  expect(readDirWithFileTypes).toHaveBeenCalledWith('file:///workspace')
})

test('stat converts an absolute path to a file uri', async () => {
  await expect(FileSystem.stat('/workspace/a.js')).resolves.toEqual({
    isDirectory: false,
    isFile: true,
  })
  expect(stat).toHaveBeenCalledWith('file:///workspace/a.js')
})

test('preserves an existing file uri', async () => {
  await FileSystem.readFile('file:///workspace/a.js')
  expect(readFile).toHaveBeenCalledWith('file:///workspace/a.js')
})

test('preserves a virtual file system uri', async () => {
  await FileSystem.readFile('memfs:///workspace/a.js')
  expect(readFile).toHaveBeenCalledWith('memfs:///workspace/a.js')
  expect(getFileHash).not.toHaveBeenCalled()
  expect(getText).not.toHaveBeenCalled()
})
