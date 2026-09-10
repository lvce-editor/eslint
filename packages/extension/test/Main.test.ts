import { expect, jest, test } from '@jest/globals'
import * as api from '@lvce-editor/api'

const activateApi = jest.fn(async () => {})
const registerCommand = jest.fn()
const registerDiagnosticProvider = jest.fn()

jest.unstable_mockModule('@lvce-editor/api', () => ({
  ...api,
  activate: activateApi,
  registerCodeActionsProvider: jest.fn(),
  registerCommand,
  registerDiagnosticProvider,
  registerFileChangeHandler: jest.fn(),
}))

const Main = await import('../src/parts/Main/Main.ts')

test('registers commands and providers before awaiting storage cleanup', async () => {
  const cleanup = Promise.withResolvers<boolean>()
  const deleteCache = jest.fn(() => cleanup.promise)
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { delete: deleteCache },
  })

  const activation = Main.activate()
  await Promise.resolve()
  expect(deleteCache).toHaveBeenCalledTimes(5)
  expect(registerCommand).toHaveBeenCalledTimes(3)
  expect(registerDiagnosticProvider).toHaveBeenCalledTimes(7)

  cleanup.resolve(true)
  await activation

  expect(activateApi).toHaveBeenCalledTimes(1)
  expect(registerCommand).toHaveBeenCalledTimes(3)
  expect(registerDiagnosticProvider).toHaveBeenCalledTimes(7)
})
