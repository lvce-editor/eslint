import { expect, test } from '@jest/globals'
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
