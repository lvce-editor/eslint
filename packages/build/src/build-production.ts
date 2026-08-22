import pluginTypeScript from '@babel/preset-typescript'
import { babel } from '@rollup/plugin-babel'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  rollup,
  type OutputChunk,
  type OutputOptions,
  type Plugin,
  type RollupBuild,
} from 'rollup'
import { root } from './root.js'

const require = createRequire(import.meta.url)
const commonjs = require('@rollup/plugin-commonjs') as () => Plugin
const json = require('@rollup/plugin-json') as () => Plugin

const nodeBuiltins = [
  'assert',
  'buffer',
  'crypto',
  'events',
  'fs',
  'module',
  'os',
  'path',
  'process',
  'stream',
  'tty',
  'url',
  'util',
  'worker_threads',
] as const

const toDestructuringPattern = (imports: string): string => {
  return imports
    .split(',')
    .map((item) => item.trim().replace(/\s+as\s+/, ': '))
    .join(', ')
}

export const replaceNodeBuiltins = (code: string): string => {
  let transformed = code.replaceAll(
    /require\s*\(\s*["']node:([^"']+)["']\s*\)/g,
    'globalThis.require("node:$1")',
  )

  transformed = transformed.replaceAll(
    /import\s+(\w+)\s+from\s+["']node:([^"']+)["']/g,
    'const $1 = globalThis.require("node:$2")',
  )
  transformed = transformed.replaceAll(
    /import\s+{([^}]+)}\s+from\s+["']node:([^"']+)["']/g,
    (_match, imports: string, moduleName: string) =>
      `const { ${toDestructuringPattern(imports)} } = globalThis.require("node:${moduleName}")`,
  )
  transformed = transformed.replaceAll(
    /import\s+\*\s+as\s+(\w+)\s+from\s+["']node:([^"']+)["']/g,
    'const $1 = globalThis.require("node:$2")',
  )

  for (const moduleName of nodeBuiltins) {
    const escapedModuleName = moduleName.replace('/', '\\/')
    transformed = transformed.replaceAll(
      new RegExp(`require\\s*\\(\\s*["']${escapedModuleName}["']\\s*\\)`, 'g'),
      `globalThis.require('${moduleName}')`,
    )
    transformed = transformed.replaceAll(
      new RegExp(
        `import\\s+(\\w+)\\s+from\\s+["']${escapedModuleName}["']`,
        'g',
      ),
      `const $1 = globalThis.require('${moduleName}')`,
    )
    transformed = transformed.replaceAll(
      new RegExp(
        `import\\s+{([^}]+)}\\s+from\\s+["']${escapedModuleName}["']`,
        'g',
      ),
      (_match, imports: string) =>
        `const { ${toDestructuringPattern(imports)} } = globalThis.require('${moduleName}')`,
    )
    transformed = transformed.replaceAll(
      new RegExp(
        `import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+["']${escapedModuleName}["']`,
        'g',
      ),
      `const $1 = globalThis.require('${moduleName}')`,
    )
  }

  return transformed
}

const nodeShimPlugin = (): Plugin => ({
  name: 'node-shims',
  transform(code, id) {
    if (
      !id.includes('node_modules') ||
      !['.cjs', '.js', '.mjs'].some((extension) => id.endsWith(extension))
    ) {
      return undefined
    }
    const transformed = replaceNodeBuiltins(code)
    return transformed === code ? undefined : transformed
  },
})

const plugins = (): Plugin[] => [
  nodeShimPlugin(),
  babel({
    babelHelpers: 'bundled',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    presets: [pluginTypeScript],
  }),
  nodeResolve({
    browser: true,
    extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
  }),
  commonjs(),
  json(),
]

const createBundle = async (input: string): Promise<RollupBuild> => {
  return rollup({
    external: (id) =>
      id === 'electron' || id === 'ws' || id.startsWith('node:'),
    input,
    plugins: plugins(),
    preserveEntrySignatures: 'strict',
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
    },
  })
}

const outputOptions = (outfile: string): OutputOptions => ({
  file: outfile,
  format: 'es',
  freeze: false,
  generatedCode: {
    constBindings: true,
    objectShorthand: true,
  },
  hoistTransitiveImports: false,
  inlineDynamicImports: true,
  minifyInternalExports: false,
})

const buildNodeShimsBanner = async (): Promise<string> => {
  const entryPoint = fileURLToPath(
    import.meta.resolve('@lvce-editor/node-shims/banner'),
  )
  const bundle = await createBundle(entryPoint)
  try {
    const { output } = await bundle.generate({ format: 'iife' })
    const chunk = output.find(
      (item): item is OutputChunk => item.type === 'chunk',
    )
    if (!chunk) {
      throw new Error('Failed to build the Node.js shim banner')
    }
    return chunk.code
  } finally {
    await bundle.close()
  }
}

const buildBundle = async (
  input: string,
  outfile: string,
  banner?: string,
): Promise<readonly string[]> => {
  const bundle = await createBundle(input)
  try {
    await bundle.write({ ...outputOptions(outfile), banner })
    return bundle.watchFiles
  } finally {
    await bundle.close()
  }
}

const extensionEntry = join(
  root,
  'packages',
  'extension',
  'src',
  'eslintMain.ts',
)
const eslintEvaluationWorkerEntry = join(
  root,
  'packages',
  'eslint-evaluation-worker',
  'src',
  'eslintEvaluationWorkerMain.ts',
)
const moduleResolutionWorkerEntry = join(
  root,
  'packages',
  'module-resolution-worker',
  'src',
  'moduleResolutionWorkerMain.ts',
)

export const buildExtension = async (outfile: string): Promise<void> => {
  const banner = await buildNodeShimsBanner()
  const bundledFiles = await buildBundle(extensionEntry, outfile, banner)
  const bundledEslintPath = bundledFiles.find((file) =>
    /(^|\/)node_modules\/eslint\//.test(file.replaceAll('\\', '/')),
  )
  if (bundledEslintPath) {
    throw new Error(`ESLint must not be bundled: ${bundledEslintPath}`)
  }
}

export const buildEslintEvaluationWorker = async (
  outfile: string,
): Promise<void> => {
  await buildBundle(eslintEvaluationWorkerEntry, outfile)
}

export const buildModuleResolutionWorker = async (
  outfile: string,
): Promise<void> => {
  await buildBundle(moduleResolutionWorkerEntry, outfile)
}
