import * as fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Each invocation uses a fresh process. Compare source revisions against the
// same installed fixture to keep dependencies, configuration and documents fixed.
const root = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = resolve(process.argv[2] ?? root)
const workspace = resolve(
  process.argv[3] ??
    `${root}/packages/e2e/fixtures/eslint-plugin-cspell-disabled`,
)
if (!globalThis.gc) throw new Error('Run with node --expose-gc')
const load = (modulePath) =>
  import(pathToFileURL(`${sourceRoot}/packages/${modulePath}`).href)
const resolver = await load(
  'module-resolution-worker/src/parts/ModuleResolution/ModuleResolution.ts',
)
const fileSystem = await load(
  'module-resolution-worker/src/parts/FileSystem/FileSystem.ts',
)
const evaluation = await load(
  'eslint-evaluation-worker/src/parts/EslintEvaluation/EslintEvaluation.ts',
)
const io = {
  readFile: (uri) => fs.readFile(new URL(uri), 'utf8'),
  readFileAsBase64: async (uri) =>
    (await fs.readFile(new URL(uri))).toString('base64'),
  stat: async (uri) => {
    const stats = await fs.stat(new URL(uri))
    return { isFile: stats.isFile(), isDirectory: stats.isDirectory() }
  },
  readDirWithFileTypes: async (uri) =>
    (await fs.readdir(new URL(uri), { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
    })),
}
fileSystem.state.api = io
const reads = []
globalThis.rpc = {
  invoke: async (method, path) => {
    reads.push({ method, path })
    return io[method.split('.').at(-1)](fileSystem.toUri(path))
  },
}
globalThis.caches = {
  open: async () => ({
    match: async () => undefined,
    put: async () => {},
    delete: async () => false,
  }),
}
const graphs = []
const dependencies = {
  loadEslintConfig: async (...args) => {
    const graph = await resolver.loadEslintConfig(...args)
    graphs.push(graph)
    return graph
  },
  loadEslintModule: async (...args) => {
    const graph = await resolver.loadEslintModule(...args)
    graphs.push(graph)
    return graph
  },
}
const disabled = process.argv[4] === '--disabled'
const text = disabled
  ? '// spllingmistake\ndebugger\n'
  : '// lvceaccepted localaccepted\nconst addEventListener = "hello wrld";\n'
const path = `${workspace}/${disabled ? 'disabled.js' : 'identifiers.js'}`
const config = `${workspace}/eslint.config.js`
const before = process.memoryUsage()
const start = performance.now()
const diagnostics = await evaluation.lintWithDependencies(
  text,
  path,
  config,
  undefined,
  dependencies,
)
const coldMs = performance.now() - start
const warmStart = performance.now()
const warmDiagnostics = await evaluation.lintWithDependencies(
  text,
  path,
  config,
  undefined,
  dependencies,
)
const warmMs = performance.now() - warmStart
for (let i = 0; i < 5; i++) globalThis.gc()
const after = process.memoryUsage()
if (process.env.CSPELL_HEAP_SNAPSHOT) {
  const { writeHeapSnapshot } = await import('node:v8')
  writeHeapSnapshot(process.env.CSPELL_HEAP_SNAPSHOT)
}
const assets = Object.entries(graphs[0].files)
  .filter(([p]) => p.includes('/@cspell/'))
  .map(([path, content]) => ({
    path,
    bytes:
      typeof content === 'string'
        ? Buffer.byteLength(content)
        : Buffer.from(content.content, 'base64').length,
  }))
const deferred = graphs[0].deferredFiles ?? {}
const scenarios = []
if (process.argv[4] === '--scenarios') {
  for (const file of [
    'disabled.js',
    'default.js',
    'explicit.js',
    'fix.js',
    'disabled.js',
  ]) {
    const count = reads.length
    const result = await evaluation.lintWithDependencies(
      await fs.readFile(`${workspace}/${file}`, 'utf8'),
      `${workspace}/${file}`,
      config,
      undefined,
      dependencies,
    )
    scenarios.push({ file, result, reads: reads.slice(count) })
  }
}
console.log(
  JSON.stringify(
    {
      scenarios,
      sourceRoot,
      before,
      after,
      coldMs,
      warmMs,
      diagnostics,
      warmDiagnostics,
      assetBytes: assets.reduce((n, a) => n + a.bytes, 0),
      assets,
      deferred,
      reads,
    },
    null,
    2,
  ),
)
