import { beforeEach, expect, test } from '@jest/globals'
import * as EslintEvaluationWorker from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as DiagnosticProvider from '../src/parts/ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'
import * as FindEslintConfig from '../src/parts/FindEslintConfig/FindEslintConfig.ts'
import * as IgnoreHashes from '../src/parts/IgnoreHashes/IgnoreHashes.ts'
import * as LastTextDocument from '../src/parts/LastTextDocument/LastTextDocument.ts'

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname)

beforeEach(() => {
  IgnoreHashes.state.getPreference = async () => undefined
  LastTextDocument.reset()
  FindEslintConfig.clearCache()
  EslintEvaluationWorker.state.rpcPromise = undefined
  EslintEvaluationWorker.state.createRpc = async () => ({
    invoke: async () => {
      throw new SyntaxError('Unexpected token (2:0)')
    },
  })
  FileSystem.state.api = {
    getFileHashes: async () => [],
    readDirWithFileTypes: async (uri: string) => {
      const path = toPath(uri)
      if (path === '/workspace') {
        return [{ name: 'eslint.config.js', type: 7 }]
      }
      return []
    },
    readFile: async (uri: string) => {
      const path = toPath(uri)
      if (path === '/workspace/eslint.config.js') {
        return 'export default [\n'
      }
      throw new Error(`File not found: ${path}`)
    },
    stat: async () => 0,
  }
})

test('returns no diagnostics when the workspace has no eslint config', async () => {
  FileSystem.state.api = {
    ...FileSystem.state.api,
    readDirWithFileTypes: async () => [],
  }
  EslintEvaluationWorker.state.createRpc = async () => {
    throw new Error('ESLint evaluation worker should not be started')
  }

  const textDocument = {
    text: '{ "name": "example" }',
    uri: '/workspace/package.json',
  }
  const diagnostics = await DiagnosticProvider.provideDiagnostics(textDocument)

  expect(diagnostics).toEqual([])
  expect(LastTextDocument.get()).toBe(textDocument)
})

test('attributes invalid config errors to the config location', async () => {
  const diagnostics = await DiagnosticProvider.provideDiagnostics({
    text: 'const value = 1',
    uri: '/workspace/src/file.ts',
  })

  expect(diagnostics).toEqual([
    {
      columnIndex: 0,
      endColumnIndex: 0,
      endRowIndex: 1,
      message: 'ESLint configuration error: Unexpected token (2:0)',
      rowIndex: 1,
      source: 'eslint',
      type: 'error',
      uri: '/workspace/eslint.config.js',
    },
  ])
})

test('loads config for a file uri with a single slash', async () => {
  const diagnostics = await DiagnosticProvider.provideDiagnostics({
    text: 'const value = 1',
    uri: 'file:/workspace/src/file.ts',
  })

  expect(diagnostics).toEqual([
    {
      columnIndex: 0,
      endColumnIndex: 0,
      endRowIndex: 1,
      message: 'ESLint configuration error: Unexpected token (2:0)',
      rowIndex: 1,
      source: 'eslint',
      type: 'error',
      uri: 'file:/workspace/eslint.config.js',
    },
  ])
})

test('skips unchanged content before config discovery and lints edits', async () => {
  const textDocument = { text: 'hello', uri: '/workspace/src/file.ts' }
  IgnoreHashes.state.getPreference = async () => [
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  ]
  let reads = 0
  const readDir = FileSystem.state.api.readDirWithFileTypes
  FileSystem.state.api = {
    ...FileSystem.state.api,
    readDirWithFileTypes: async (uri: string) => {
      reads++
      return readDir(uri)
    },
  }
  expect(await DiagnosticProvider.provideDiagnostics(textDocument)).toEqual([])
  expect(LastTextDocument.get()).toBe(textDocument)
  expect(reads).toBe(0)
  expect(EslintEvaluationWorker.state.rpcPromise).toBeUndefined()

  expect(
    await DiagnosticProvider.provideDiagnostics({
      ...textDocument,
      text: 'hello!',
    }),
  ).toHaveLength(1)
  expect(reads).toBeGreaterThan(0)
  expect(EslintEvaluationWorker.state.rpcPromise).toBeDefined()
  expect(await DiagnosticProvider.provideDiagnostics(textDocument)).toEqual([])
})
