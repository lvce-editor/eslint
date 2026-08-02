import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'

const readDirWithFileTypes = jest.fn(async (_uri: string) => [
  { name: 'eslint.config.js', type: 7 },
])
const readFile = jest.fn(async (_uri: string) => 'content')
const stat = jest.fn(async (_uri: string) => 7)

beforeEach(() => {
  jest.clearAllMocks()
  FileSystem.state.api = {
    readDirWithFileTypes,
    readFile,
    stat,
  }
})

test('readFile converts an absolute path to a file uri', async () => {
  await expect(FileSystem.readFile('/workspace/a b.js')).resolves.toBe(
    'content',
  )
  expect(readFile).toHaveBeenCalledWith('file:///workspace/a%20b.js')
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
