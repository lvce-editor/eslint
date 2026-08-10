import { beforeEach, expect, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as FindEslintConfig from '../src/parts/FindEslintConfig/FindEslintConfig.ts'

const state: { files: readonly string[] } = { files: [] }

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname).replace(/\/$/, '') || '/'

const readDirWithFileTypes = async (
  uri: string,
): Promise<Array<{ name: string; type: number }>> => {
  const directory = toPath(uri)
  const prefix = directory === '/' ? '/' : `${directory}/`
  return state.files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((file) => !file.includes('/'))
    .map((name) => ({ name, type: 7 }))
}

beforeEach(() => {
  state.files = []
  FileSystem.state.api = {
    getFileHashes: async () => [],
    readDirWithFileTypes,
    readFile: async () => '',
    stat: async () => 0,
  }
})

test('finds eslint.config.js in the current directory', async () => {
  state.files = ['/workspace/src/eslint.config.js']

  await expect(
    FindEslintConfig.findEslintConfig('/workspace/src/file.js'),
  ).resolves.toBe('/workspace/src/eslint.config.js')
})

test('finds eslint.config.js in a parent directory', async () => {
  state.files = ['/workspace/eslint.config.js']

  await expect(
    FindEslintConfig.findEslintConfig('/workspace/src/file.js'),
  ).resolves.toBe('/workspace/eslint.config.js')
})

test('ignores unsupported eslint config locations', async () => {
  state.files = [
    '/workspace/eslint.config.mjs',
    '/workspace/eslint.config.cjs',
    '/workspace/.eslintrc.js',
    '/workspace/.eslintrc.cjs',
    '/workspace/.eslintrc.json',
    '/workspace/.eslintrc.yaml',
    '/workspace/.eslintrc.yml',
    '/workspace/.eslintrc',
    '/workspace/package.json',
  ]

  await expect(
    FindEslintConfig.findEslintConfig('/workspace/src/file.js'),
  ).resolves.toBeNull()
})
