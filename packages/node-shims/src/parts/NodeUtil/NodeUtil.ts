export const createNodeUtil = () => ({
  deprecate: <T>(fn: T, _message?: string): T => fn,
  inspect: (value: unknown): string => JSON.stringify(value, null, 2),
  promisify:
    <Arguments extends unknown[], Result>(
      fn: (...args: Arguments) => Result,
    ): ((...args: Arguments) => Promise<Result>) =>
    (...args: Arguments) =>
      Promise.resolve(fn(...args)),
  types: {
    isArray: (value: unknown): boolean => Array.isArray(value),
    isAsyncFunction: (value: unknown): boolean => {
      return (
        typeof value === 'function' &&
        value.constructor.name === 'AsyncFunction'
      )
    },
    isBigInt: (value: unknown): boolean => typeof value === 'bigint',
    isBigInt64Array: (value: unknown): boolean =>
      value instanceof BigInt64Array,
    isBigUint64Array: (value: unknown): boolean =>
      value instanceof BigUint64Array,
    isBoolean: (value: unknown): boolean => typeof value === 'boolean',
    isDate: (value: unknown): boolean => value instanceof Date,
    isFunction: (value: unknown): boolean => typeof value === 'function',
    isGeneratorFunction: (value: unknown): boolean => {
      return (
        typeof value === 'function' &&
        value.constructor.name === 'GeneratorFunction'
      )
    },
    isMap: (value: unknown): boolean => value instanceof Map,
    isNull: (value: unknown): boolean => value === null,
    isNumber: (value: unknown): boolean => typeof value === 'number',
    isObject: (value: unknown): boolean =>
      typeof value === 'object' && value !== null,
    isPromise: (value: unknown): boolean => value instanceof Promise,
    isRegExp: (value: unknown): boolean => value instanceof RegExp,
    isSet: (value: unknown): boolean => value instanceof Set,
    isString: (value: unknown): boolean => typeof value === 'string',
    isUndefined: (value: unknown): boolean => value === undefined,
    isWeakMap: (value: unknown): boolean => value instanceof WeakMap,
    isWeakSet: (value: unknown): boolean => value instanceof WeakSet,
  },
})
