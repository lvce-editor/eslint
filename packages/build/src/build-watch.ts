import { context } from 'esbuild'
import { root } from './root.js'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const main = async (): Promise<void> => {
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

  const ctx = await context({
    entryPoints: [join(root, 'packages', 'extension', 'src', 'eslintMain.ts')],
    bundle: true,
    format: 'esm',
    outfile: join(root, 'packages', 'extension', 'dist', 'eslintMain.js'),
    external: [
      'node:*',
      'path',
      'fs',
      'url',
      'crypto',
      'os',
      'util',
      'assert',
      'module',
      'events',
      'tty',
      'stream',
      'buffer',
      'process',
      'worker_threads',
      'jiti',
      'jiti/package.json',
    ],
    packages: 'bundle',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    platform: 'browser',
    plugins: [
      {
        name: 'inject-node-shims-first',
        setup(build) {
          // Inject banner code at the entry point to ensure it runs first
          build.onLoad({ filter: /eslintMain\.ts$/ }, (args) => {
            const contents = readFileSync(args.path, 'utf-8')
            // Prepend banner code to the entry point
            return {
              contents: bannerCode + '\n' + contents,
              loader: 'ts',
            }
          })
        },
      },
      {
        name: 'ensure-eslint-bundled',
        setup(build) {
          // Ensure eslint is resolved and bundled
          build.onResolve({ filter: /^eslint$/ }, (args) => {
            // Don't mark as external - let it be bundled
            return undefined
          })
        },
      },
      {
        name: 'ensure-esquery-exports',
        setup(build) {
          // Intercept esquery resolution and use the ESM version
          // esbuild should handle the default export correctly when bundling
          build.onResolve({ filter: /^esquery$/ }, (args) => {
            const require = createRequire(import.meta.url)
            return {
              path: require.resolve('esquery/dist/esquery.esm.min.js'),
            }
          })
        },
      },
      {
        name: 'node-shim-replace',
        setup(build) {
          build.onLoad({ filter: /.*/ }, (args) => {
            // Only process JavaScript files in node_modules
            // Don't process TypeScript files or source files
            if (
              !args.path.includes('node_modules') ||
              (!args.path.endsWith('.js') &&
                !args.path.endsWith('.cjs') &&
                !args.path.endsWith('.mjs'))
            ) {
              return undefined
            }
            try {
              const contents = readFileSync(args.path, 'utf-8')
              const nodeBuiltins = [
                'path',
                'fs',
                'url',
                'crypto',
                'os',
                'util',
                'assert',
                'module',
                'events',
                'tty',
                'stream',
                'buffer',
                'process',
                'worker_threads',
              ]
              let modified = contents

              // Replace require("node:*) with globalThis.require("node:*")
              modified = modified.replace(
                /require\s*\(\s*["']node:([^"']+)["']\s*\)/g,
                'globalThis.require("node:$1")',
              )

              // Replace require('path'), require("fs"), etc. with globalThis.require()
              for (const moduleName of nodeBuiltins) {
                const regex = new RegExp(
                  `require\\s*\\(\\s*["']${moduleName}["']\\s*\\)`,
                  'g',
                )
                modified = modified.replace(
                  regex,
                  `globalThis.require('${moduleName}')`,
                )
              }

              // Replace ES6 import statements: import fs from "node:fs"
              modified = modified.replace(
                /import\s+(\w+)\s+from\s+["']node:([^"']+)["']/g,
                (match, varName, moduleName) => {
                  // Skip if this looks like already-replaced code
                  if (
                    match.includes('__node_module_') ||
                    match.includes('globalThis.require')
                  ) {
                    return match
                  }
                  return `const ${varName} = globalThis.require("node:${moduleName}")`
                },
              )

              // Replace ES6 import statements: import { createRequire } from "node:module"
              modified = modified.replace(
                /import\s+{([^}]+)}\s+from\s+["']node:([^"']+)["']/g,
                (match, imports, moduleName) => {
                  // Skip if this looks like already-replaced code
                  if (
                    match.includes('__node_module_') ||
                    match.includes('globalThis.require')
                  ) {
                    return match
                  }
                  const moduleVar = `__node_module_${moduleName.replace(/[^a-zA-Z0-9]/g, '_')}__`
                  return `const ${moduleVar} = globalThis.require("node:${moduleName}"); const { ${imports} } = ${moduleVar}`
                },
              )

              // Replace ES6 import statements: import * as path from "node:path"
              modified = modified.replace(
                /import\s+\*\s+as\s+(\w+)\s+from\s+["']node:([^"']+)["']/g,
                (match, varName, moduleName) => {
                  // Skip if this looks like already-replaced code
                  if (
                    match.includes('__node_module_') ||
                    match.includes('globalThis.require')
                  ) {
                    return match
                  }
                  return `const ${varName} = globalThis.require("node:${moduleName}")`
                },
              )

              // Replace ES6 import statements: import fs from "fs" (non-prefixed)
              for (const moduleName of nodeBuiltins) {
                // Default import: import fs from "fs"
                modified = modified.replace(
                  new RegExp(
                    `import\\s+(\\w+)\\s+from\\s+["']${moduleName}["']`,
                    'g',
                  ),
                  (match, varName) => {
                    // Skip if this looks like already-replaced code
                    if (
                      match.includes('__node_module_') ||
                      match.includes('globalThis.require')
                    ) {
                      return match
                    }
                    return `const ${varName} = globalThis.require('${moduleName}')`
                  },
                )

                // Named imports: import { something } from "fs"
                modified = modified.replace(
                  new RegExp(
                    `import\\s+{([^}]+)}\\s+from\\s+["']${moduleName}["']`,
                    'g',
                  ),
                  (match, imports) => {
                    // Skip if this looks like already-replaced code
                    if (
                      match.includes('__node_module_') ||
                      match.includes('globalThis.require')
                    ) {
                      return match
                    }
                    const moduleVar = `__node_module_${moduleName}__`
                    return `const ${moduleVar} = globalThis.require('${moduleName}'); const { ${imports} } = ${moduleVar}`
                  },
                )

                // Namespace import: import * as fs from "fs"
                modified = modified.replace(
                  new RegExp(
                    `import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+["']${moduleName}["']`,
                    'g',
                  ),
                  (match, varName) => {
                    // Skip if this looks like already-replaced code
                    if (
                      match.includes('__node_module_') ||
                      match.includes('globalThis.require')
                    ) {
                      return match
                    }
                    return `const ${varName} = globalThis.require('${moduleName}')`
                  },
                )
              }

              return {
                contents: modified,
                loader: 'js',
              }
            } catch {
              // If we can't read the file, let esbuild handle it
              return undefined
            }
          })
        },
      },
    ],
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  })

  await ctx.watch()
  // eslint-disable-next-line no-console
  console.log('Watching for changes...')
}

main()
