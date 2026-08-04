import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'

const readDirWithFileTypes = jest.fn(async (_uri: string) => [
  { name: 'eslint.config.js', type: 7 },
])
const readFile = jest.fn(async (_uri: string) => 'content')
const stat = jest.fn(async (_uri: string) => 7)
const appendLine = jest.fn(async (_text: string) => {})

beforeEach(() => {
  jest.clearAllMocks()
  FileSystem.state.api = {
    readDirWithFileTypes,
    readFile,
    stat,
  }
  FileSystem.state.now = () => 0
  FileSystem.state.outputChannel = {
    appendLine,
  }
})

test('readFile converts an absolute path to a file uri', async () => {
  await expect(FileSystem.readFile('/workspace/a b.js')).resolves.toBe(
    'content',
  )
  expect(readFile).toHaveBeenCalledWith('file:///workspace/a%20b.js')
  expect(appendLine).toHaveBeenCalledWith(
    'Read file:///workspace/a%20b.js in 0.00ms',
  )
})

test('readFile logs how long the file read took', async () => {
  const now = jest
    .fn<() => number>()
    .mockReturnValueOnce(10)
    .mockReturnValueOnce(12.345)
  FileSystem.state.now = now

  await FileSystem.readFile('/workspace/file.js')

  expect(appendLine).toHaveBeenCalledWith(
    'Read file:///workspace/file.js in 2.35ms',
  )
})

test('readFile preserves the read result when output logging fails', async () => {
  appendLine.mockRejectedValueOnce(new Error('Failed to write output'))

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
})
