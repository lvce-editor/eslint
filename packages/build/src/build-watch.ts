import { context } from 'esbuild'
import { root } from './root.js'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

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
    banner: {
      js: bannerCode,
    },
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
      'jiti',
      'jiti/package.json',
    ],
    plugins: [
      {
        name: 'node-shim-replace',
        setup(build) {
          build.onLoad({ filter: /.*/ }, (args) => {
            // Only process JavaScript files in node_modules
            if (
              !args.path.includes('node_modules') ||
              (!args.path.endsWith('.js') && !args.path.endsWith('.cjs'))
            ) {
              return undefined
            }
            try {
              const contents = readFileSync(args.path, 'utf-8')
              // Replace require("node:*) with globalThis.require("node:*")
              // Replace require('path'), require("fs"), etc. with globalThis.require()
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
              ]
              let modified = contents.replace(
                /require\s*\(\s*["']node:([^"']+)["']\s*\)/g,
                'globalThis.require("node:$1")',
              )
              // Replace non-prefixed requires for built-in modules
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
  })

  await ctx.watch()
  // eslint-disable-next-line no-console
  console.log('Watching for changes...')
}

main()
