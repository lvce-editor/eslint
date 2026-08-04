import { beforeEach, expect, test } from '@jest/globals'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as LoadEslint from '../src/parts/LoadEslint/LoadEslint.ts'

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

const stat = async (uri: string): Promise<number> => {
  const path = toPath(uri)
  if (path in state.files) {
    return 7
  }
  const prefix = `${path.replace(/\/$/, '')}/`
  if (Object.keys(state.files).some((file) => file.startsWith(prefix))) {
    return 3
  }
  throw new Error(`File not found: ${path}`)
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
  FileSystem.state.api = {
    readDirWithFileTypes,
    readFile,
    stat,
  }
})

test('loads Linter from the closest project node_modules', async () => {
  state.files = {
    '/workspace/node_modules/eslint/index.js':
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    '/workspace/node_modules/eslint/package.json': '{"main":"index.js"}',
  }

  const Linter = await LoadEslint.loadEslint('/workspace/src/file.js')

  expect(Linter.name).toBe('ProjectLinter')
})

test('loads Linter when a non-file filesystem does not implement stat', async () => {
  const files: Record<string, string> = {
    'html:///workspace/node_modules/eslint/index.js':
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    'html:///workspace/node_modules/eslint/package.json': '{"main":"index.js"}',
  }
  FileSystem.state.api = {
    readDirWithFileTypes: async (uri: string) => {
      const prefix = `${uri.replace(/\/$/, '')}/`
      const entries = new Map<string, { name: string; type: number }>()
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) {
          continue
        }
        const relative = file.slice(prefix.length)
        const slashIndex = relative.indexOf('/')
        const name =
          slashIndex === -1 ? relative : relative.slice(0, slashIndex)
        entries.set(name, { name, type: slashIndex === -1 ? 7 : 3 })
      }
      return entries.values().toArray()
    },
    readFile: async (uri: string) => files[uri],
    stat: async () => {
      throw new Error('stat is not implemented')
    },
  }

  const Linter = await LoadEslint.loadEslint('html:///workspace/src/file.js')

  expect(Linter.name).toBe('ProjectLinter')
})

test('reports when eslint is not installed in the project', async () => {
  await expect(
    LoadEslint.loadEslint('/missing-workspace/src/file.js'),
  ).rejects.toThrow(
    'Cannot find ESLint in project node_modules for /missing-workspace/src/file.js',
  )
})

test('rejects a project eslint package without Linter', async () => {
  state.files = {
    '/invalid-workspace/node_modules/eslint/index.js': 'module.exports = {}',
    '/invalid-workspace/node_modules/eslint/package.json':
      '{"main":"index.js"}',
  }

  await expect(
    LoadEslint.loadEslint('/invalid-workspace/file.js'),
  ).rejects.toThrow('Project ESLint module does not export Linter')
})

test('loads and runs the installed project eslint package', async () => {
  const {
    readdir: readDirectoryNative,
    readFile: readFileNative,
    stat: statNative,
  } = (globalThis as any).process.getBuiltinModule('node:fs/promises')
  const { fileURLToPath } = (globalThis as any).process.getBuiltinModule(
    'node:url',
  )
  FileSystem.state.api = {
    readDirWithFileTypes: async (uri: string) => {
      const entries = await readDirectoryNative(new URL(uri), {
        withFileTypes: true,
      })
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 3 : 7,
      }))
    },
    readFile: async (uri: string) =>
      readFileNative(new URL(uri), { encoding: 'utf8' }),
    stat: async (uri: string) => {
      const value = await statNative(new URL(uri))
      return value.isDirectory() ? 3 : 7
    },
  }
  const filePath = fileURLToPath(
    new URL('../../project-file.js', import.meta.url),
  )

  const Linter = await LoadEslint.loadEslint(filePath)
  const messages = new Linter({ configType: 'flat' }).verify('debugger', [
    { rules: { 'no-debugger': 'error' } },
  ])

  expect(messages[0].ruleId).toBe('no-debugger')
})
