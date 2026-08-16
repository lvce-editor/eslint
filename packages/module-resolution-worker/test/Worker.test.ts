import { afterEach, expect, jest, test } from '@jest/globals'
import * as Worker from '../src/parts/Worker/Worker.ts'

afterEach(() => {
  jest.useRealTimers()
  Object.defineProperty(globalThis, 'close', {
    configurable: true,
    value: undefined,
  })
})

test('closes the worker after replying to the dispose command', () => {
  jest.useFakeTimers()
  const close = jest.fn<() => void>()
  Object.defineProperty(globalThis, 'close', {
    configurable: true,
    value: close,
  })

  Worker.dispose()

  expect(close).not.toHaveBeenCalled()
  jest.runAllTimers()
  expect(close).toHaveBeenCalledTimes(1)
})
