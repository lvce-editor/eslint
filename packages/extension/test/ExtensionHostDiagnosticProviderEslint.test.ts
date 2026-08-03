import { beforeEach, expect, test } from '@jest/globals'
import * as DiagnosticProvider from '../src/parts/ExtensionHost/ExtensionHostDiagnosticProviderEslint.ts'
import * as FileSystem from '../src/parts/FileSystem/FileSystem.ts'

const toPath = (uri: string): string =>
  decodeURIComponent(new URL(uri).pathname)

beforeEach(() => {
  FileSystem.state.api = {
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
