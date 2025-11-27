import type { Plugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const createNodeShimPlugin = (root: string): Plugin => {
  const bannerPath = join(
    root,
    'packages',
    'extension',
    'src',
    'parts',
    'NodeShims',
    'NodeShimsBanner.ts',
  )

  const bannerCode = readFileSync(bannerPath, 'utf-8')

  return {
    name: 'node-shim',
    setup(build) {
      // Mark node: modules as external
      build.onResolve({ filter: /^node:/ }, () => {
        return { path: 'node-shim', namespace: 'node-shim' }
      })

      // Provide the shim for node: modules
      build.onLoad({ filter: /.*/, namespace: 'node-shim' }, () => {
        return {
          contents: `
            if (typeof globalThis.modules === 'undefined') {
              throw new Error('Node shims not initialized. Make sure NodeShimsBanner is loaded first.')
            }
            const moduleName = 'node:' + arguments[0]?.path || ''
            const module = globalThis.modules[moduleName]
            if (!module) {
              throw new Error(\`Cannot find module '\${moduleName}'\`)
            }
            export default module
            export * from module
          `,
          loader: 'js',
        }
      })

      // Inject banner code at the start
      build.initialOptions.banner = {
        js: bannerCode,
      }
    },
  }
}

