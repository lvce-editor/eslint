import { expect, test } from '@jest/globals'
import * as Path from '../src/parts/Path/Path.ts'

// cspell:ignore hidden

test.each([
  [
    '/project/node_modules/package/index.js',
    '/project/node_modules/package/index.js',
  ],
  ['/project/.hidden/file.ts', '/project/.hidden/file.ts'],
  ['/project/module..js', '/project/module..js'],
  ['/project/my%20file.ts', '/project/my%20file.ts'],
  ['/C:/project/file.ts', '/C:/project/file.ts'],
  ['/C:', '/C:'],
  ['/', '/'],
  ['/project/', '/project'],
  ['/project//file.ts', '/project/file.ts'],
  ['/project/./file.ts', '/project/file.ts'],
  ['/project/../file.ts', '/file.ts'],
  ['/project/.', '/project'],
  ['/project/..', '/'],
  ['/project\\nested\\file.ts', '/project/nested/file.ts'],
  ['project/file.ts', '/project/file.ts'],
  ['file:///project/../file.ts', 'file:///file.ts'],
  ['https://example.com/project/../file.ts', 'https://example.com/file.ts'],
])('normalizes %s', (input, expected) => {
  expect(Path.normalize(input)).toBe(expected)
})

test('basename retains suffix handling and normalized trailing separators', () => {
  expect(Path.basename('/project/file.ts', '.ts')).toBe('file')
  expect(Path.basename('/project/nested/../file.ts')).toBe('file.ts')
  expect(Path.basename('/project/nested/')).toBe('nested')
  expect(Path.basename('/')).toBe('')
  expect(Path.basename('file:///project/file.ts')).toBe('file.ts')
})
