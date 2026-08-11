export const createNodeModule = () => ({
  _cache: {},
  createRequire: (_filename: string) => globalThis.require,
})
