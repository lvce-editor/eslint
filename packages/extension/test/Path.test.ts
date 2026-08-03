import { expect, test } from '@jest/globals'
import * as Path from '../src/parts/Path/Path.ts'

test('normalizes virtual file system uris', () => {
  expect(Path.normalize('memfs:///workspace/src/../file.js')).toBe(
    'memfs:///workspace/file.js',
  )
})

test('gets the dirname of virtual file system uris', () => {
  expect(Path.dirname('memfs:///workspace/file.js')).toBe('memfs:///workspace')
  expect(Path.dirname('memfs:///workspace')).toBe('memfs:///')
})

test('joins virtual file system uri paths', () => {
  expect(Path.join('memfs:///workspace', 'node_modules', 'eslint')).toBe(
    'memfs:///workspace/node_modules/eslint',
  )
})

test('normalizes windows paths', () => {
  expect(Path.normalize(String.raw`D:\workspace\src\..\file.js`)).toBe(
    '/D:/workspace/file.js',
  )
})
