import { expect, test } from '@jest/globals'
import * as Path from '../src/parts/Path/Path.ts'

test('normalizes virtual file system uris', () => {
  expect(Path.normalize('memfs:///workspace/src/../file.js')).toBe(
    'memfs:///workspace/file.js',
  )
})

test('normalizes remote ssh uri paths without changing the authority', () => {
  expect(
    Path.normalize(
      'remote-ssh://user@example.com:2222/work%20tree/src/../file.js',
    ),
  ).toBe('remote-ssh://user@example.com:2222/work%20tree/file.js')
  expect(Path.normalize('remote-ssh://example.com/../../file.js')).toBe(
    'remote-ssh://example.com/file.js',
  )
})

test('gets the dirname of virtual file system uris', () => {
  expect(Path.dirname('memfs:///workspace/file.js')).toBe('memfs:///workspace')
  expect(Path.dirname('memfs:///workspace')).toBe('memfs:///')
})

test('gets the dirname of remote ssh uri paths', () => {
  expect(Path.dirname('remote-ssh://example.com/work/file.js')).toBe(
    'remote-ssh://example.com/work',
  )
  expect(Path.dirname('remote-ssh://example.com/file.js')).toBe(
    'remote-ssh://example.com/',
  )
  expect(Path.dirname('remote-ssh://example.com/')).toBe(
    'remote-ssh://example.com/',
  )
})

test('joins virtual file system uri paths', () => {
  expect(Path.join('memfs:///workspace', 'node_modules', 'eslint')).toBe(
    'memfs:///workspace/node_modules/eslint',
  )
})

test('joins remote ssh uri paths without changing the authority', () => {
  expect(Path.join('remote-ssh://example.com/work', 'src', 'file.js')).toBe(
    'remote-ssh://example.com/work/src/file.js',
  )
})

test('normalizes windows paths', () => {
  expect(Path.normalize(String.raw`D:\workspace\src\..\file.js`)).toBe(
    '/D:/workspace/file.js',
  )
})
