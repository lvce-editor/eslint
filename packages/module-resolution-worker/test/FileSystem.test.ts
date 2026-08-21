import { expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'

test('converts posix paths to file uris', () => {
  expect(FileSystem.toUri('/workspace/a b#c?.js')).toBe(
    'file:///workspace/a%20b%23c%3F.js',
  )
  expect(FileSystem.toPath('file:///workspace/a%20b%23c%3F.js')).toBe(
    '/workspace/a b#c?.js',
  )
})

test('converts windows paths to file uris', () => {
  expect(FileSystem.toUri(String.raw`C:\workspace\a b.js`)).toBe(
    'file:///C:/workspace/a%20b.js',
  )
  expect(FileSystem.toPath('file:///C:/workspace/a%20b.js')).toBe(
    '/C:/workspace/a b.js',
  )
})

test('converts unc paths to file uris', () => {
  expect(FileSystem.toUri(String.raw`\\server\share\a b.js`)).toBe(
    'file://server/share/a%20b.js',
  )
  expect(FileSystem.toPath('file://server/share/a%20b.js')).toBe(
    '//server/share/a b.js',
  )
})

test('preserves non-file uris', () => {
  expect(FileSystem.toUri('memfs:///workspace/a.js')).toBe(
    'memfs:///workspace/a.js',
  )
  expect(FileSystem.toPath('memfs:///workspace/a.js')).toBe(
    'memfs:///workspace/a.js',
  )
})

test('captures file read timings and content lengths', async () => {
  const readFile = jest.fn(async () => 'hello')
  FileSystem.state.api = {
    readDirWithFileTypes: async () => [],
    readFile,
    stat: async () => ({ isDirectory: false, isFile: true }),
  }

  const capture = await FileSystem.captureFileReads(() =>
    FileSystem.readFile('/workspace/file.js'),
  )

  expect(capture.error).toBeUndefined()
  expect(capture.result).toBe('hello')
  expect(capture.durationMs).toBeGreaterThanOrEqual(0)
  expect(capture.reads).toHaveLength(1)
  expect(capture.reads[0]).toMatchObject({
    contentLength: 5,
    path: '/workspace/file.js',
  })
  expect(capture.reads[0].durationMs).toBeGreaterThanOrEqual(0)
})

test('includes failed reads in a capture', async () => {
  FileSystem.state.api = {
    readDirWithFileTypes: async () => [],
    readFile: async () => {
      throw new Error('missing')
    },
    stat: async () => ({ isDirectory: false, isFile: true }),
  }

  const capture = await FileSystem.captureFileReads(() =>
    FileSystem.readFile('/workspace/missing.js'),
  )

  expect(capture.error).toEqual(new Error('missing'))
  expect(capture.reads).toHaveLength(1)
  expect(capture.reads[0]).toMatchObject({
    error: 'missing',
    path: '/workspace/missing.js',
  })
})
