export const createNodeAssert = () => ({
  equal: (actual: unknown, expected: unknown, message?: string): void => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
  ok: (value: unknown, message?: string): void => {
    if (!value) {
      throw new Error(message || 'Assertion failed')
    }
  },
  strictEqual: (actual: unknown, expected: unknown, message?: string): void => {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, but got ${actual}`)
    }
  },
})
