// This file is injected by esbuild to set up require() for node: modules
// It must be loaded before any code that uses require("node:*")

if (globalThis.require === undefined) {
  // @ts-ignore
  globalThis.require = ((id: string) => {
    if (id.startsWith('node:')) {
      const module = globalThis.modules?.[id]
      if (module) {
        return module
      }
    }
    throw new Error(`Cannot find module '${id}'`)
    // @ts-ignore
  }) as NodeRequire
}
