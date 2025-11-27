import { expect, test, beforeEach } from '@jest/globals'
import * as Lint from '../src/parts/Lint/Lint.ts'

// Mock vscode global
beforeEach(() => {
  // @ts-ignore
  globalThis.vscode = {
    executeCommand: async (method: string, ...args: unknown[]) => {
      // Mock file system operations for tests
      if (method === 'FileSystem.readFile') {
        const path = args[0] as string
        // Return empty string for non-existent files
        if (path.includes('eslint.config')) {
          return ''
        }
        return ''
      }
      if (method === 'FileSystem.readDirWithFileTypes') {
        return []
      }
      if (method === 'FileSystem.stat') {
        return { isFile: false, isDirectory: false }
      }
      throw new Error(`Unexpected method: ${method}`)
    },
  }
})

test('valid code returns no errors', async (): Promise<void> => {
  const code = 'const x = 1\nconst y = 2\nconsole.log(x + y)'
  const results = await Lint.lint(code, '/test/file.js')
  expect(results).toHaveLength(0)
})

test('unused variable returns warning', async (): Promise<void> => {
  const code = 'const x = 1\nconst y = 2'
  const results = await Lint.lint(code, '/test/file.js')
  expect(results.length).toBeGreaterThan(0)
  const unusedVarWarning = results.find(
    (result) => result.ruleId === 'no-unused-vars',
  )
  expect(unusedVarWarning).toBeDefined()
  expect(unusedVarWarning?.severity).toBe('warning')
})

test('undefined variable returns error', async (): Promise<void> => {
  const code = 'console.log(undefinedVar)'
  const results = await Lint.lint(code, '/test/file.js')
  expect(results.length).toBeGreaterThan(0)
  const undefinedError = results.find((result) => result.ruleId === 'no-undef')
  expect(undefinedError).toBeDefined()
  expect(undefinedError?.severity).toBe('error')
})

test('debugger statement returns error', async (): Promise<void> => {
  const code = 'const x = 1\ndebugger\nconst y = 2'
  const results = await Lint.lint(code, '/test/file.js')
  expect(results.length).toBeGreaterThan(0)
  const debuggerError = results.find(
    (result) => result.ruleId === 'no-debugger',
  )
  expect(debuggerError).toBeDefined()
  expect(debuggerError?.severity).toBe('error')
})

test('unreachable code returns error', async (): Promise<void> => {
  const code = 'function test() {\n  return\n  console.log("unreachable")\n}'
  const results = await Lint.lint(code, '/test/file.js')
  expect(results.length).toBeGreaterThan(0)
  const unreachableError = results.find(
    (result) => result.ruleId === 'no-unreachable',
  )
  expect(unreachableError).toBeDefined()
  expect(unreachableError?.severity).toBe('error')
})

test('empty string returns no errors', async (): Promise<void> => {
  const code = ''
  const results = await Lint.lint(code, '/test/file.js')
  expect(results).toHaveLength(0)
})

test('results have correct structure', async (): Promise<void> => {
  const code = 'const x = 1'
  const results = await Lint.lint(code, '/test/file.js')
  if (results.length > 0) {
    const result = results[0]
    expect(result).toHaveProperty('line')
    expect(result).toHaveProperty('column')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('severity')
    expect(result).toHaveProperty('ruleId')
    expect(typeof result.line).toBe('number')
    expect(typeof result.column).toBe('number')
    expect(typeof result.message).toBe('string')
    expect(['error', 'warning']).toContain(result.severity)
  }
})
