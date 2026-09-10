import { expect, jest, test } from '@jest/globals'
import * as Main from '../src/parts/Main/Main.ts'

test('registers commands and providers before awaiting storage cleanup', async () => {
  const cleanup = Promise.withResolvers<void>()
  const initializeApi = jest.fn(async () => {})
  const register = jest.fn()
  const removeLegacyCaches = jest.fn(() => cleanup.promise)

  const activation = Main.activateWithDependencies(
    initializeApi,
    register,
    removeLegacyCaches,
  )
  await Promise.resolve()

  expect(initializeApi).toHaveBeenCalledTimes(1)
  expect(register).toHaveBeenCalledTimes(1)
  expect(removeLegacyCaches).toHaveBeenCalledTimes(1)
  expect(register.mock.invocationCallOrder[0]).toBeLessThan(
    removeLegacyCaches.mock.invocationCallOrder[0],
  )

  cleanup.resolve()
  await activation
})
