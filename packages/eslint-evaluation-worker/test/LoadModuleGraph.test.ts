import { expect, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as LoadModuleGraph from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'

const graph = (
  modules: Record<string, string>,
  resolutions: Record<string, string> = {},
): ModuleGraph => ({
  entry: '/workspace/eslint.config.js',
  id: 'test-graph',
  modules,
  resolutions,
})

test('loads a commonjs config', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = [{ rules: {} }]`,
    }),
  )
  expect(value).toEqual([{ rules: {} }])
})

test('unwraps a babel esm default export', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `Object.defineProperty(exports, '__esModule', { value: true }); exports.default = [{ rules: {} }]`,
    }),
  )
  expect(value).toEqual([{ rules: {} }])
})

test('loads a relative dependency', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/eslint.config.js': `module.exports = require('./rules.js')`,
        '/workspace/rules.js': `module.exports = [{ rules: { semi: 'error' } }]`,
      },
      {
        '/workspace/eslint.config.js\0./rules.js': '/workspace/rules.js',
      },
    ),
  )
  expect(value[0].rules.semi).toBe('error')
})

test('loads a json dependency', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/config.json': `[{"rules":{"eqeqeq":"warn"}}]`,
        '/workspace/eslint.config.js': `module.exports = require('./config.json')`,
      },
      {
        '/workspace/eslint.config.js\0./config.json': '/workspace/config.json',
      },
    ),
  )
  expect(value[0].rules.eqeqeq).toBe('warn')
})

test('supports circular commonjs modules', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/a.js': `exports.name = 'a'; require('./b.js')`,
        '/workspace/b.js': `require('./a.js')`,
        '/workspace/eslint.config.js': `const a = require('./a.js'); module.exports = [{ name: a.name }]`,
      },
      {
        '/workspace/a.js\0./b.js': '/workspace/b.js',
        '/workspace/b.js\0./a.js': '/workspace/a.js',
        '/workspace/eslint.config.js\0./a.js': '/workspace/a.js',
      },
    ),
  )
  expect(value).toEqual([{ name: 'a' }])
})

test('provides the path shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const path = require('node:path'); module.exports = path.basename('/a/file.js', '.js')`,
    }),
  )
  expect(value).toBe('file')
})

test('preserves trailing separators for directory joins', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const path = require('node:path'); const joined = path.join('/workspace/.eslint-plugin-local', '../'); module.exports = [joined, path.normalize(joined)]`,
    }),
  )
  expect(value).toEqual(['/workspace/', '/workspace/'])
})

test('preserves relative paths for relative joins and normalization', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const path = require('node:path'); const root = path.normalize(path.join('/workspace/.eslint-plugin-local', '../')); const relative = path.normalize('/workspace/src/main.ts').substring(root.length); module.exports = [relative, path.posix.join(path.posix.dirname(relative), './vs/base/common/jsonc.js'), path.join('src', '../build'), path.normalize('src/../main.ts')]`,
    }),
  )
  expect(value).toEqual([
    'src/main.ts',
    'src/vs/base/common/jsonc.js',
    'build',
    'main.ts',
  ])
})

test('provides path posix and win32 entry points', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = [require('node:path/posix').basename('/a/b'), require('node:path/win32').basename('/a/b')]`,
    }),
  )
  expect(value).toEqual(['b', 'b'])
})

test('resolves paths with node semantics', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const path = require('path'); module.exports = [path.resolve('/workspace', '/'), path.resolve('/workspace', 'src'), path.resolve('src')]`,
    }),
  )
  expect(value).toEqual(['/', '/workspace/src', '/workspace/src'])
})

test('provides the performance hooks shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = typeof require('node:perf_hooks').performance.now()`,
    }),
  )
  expect(value).toBe('number')
})

test('provides a single-cpu os shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const os = require('os'); module.exports = [os.cpus().length, os.availableParallelism(), os.release()]`,
    }),
  )
  expect(value).toEqual([1, 1, ''])
})

test('provides a safe process shim to config dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const processModule = require('node:process'); module.exports = [processModule.version, processModule.versions.node, processModule.argv.length, processModule.features.typescript, typeof processModule.hrtime.bigint(), processModule.platform, processModule.stdout.isTTY, processModule.stderr.fd]`,
    }),
  )
  expect(value).toEqual([
    'v0.0.0',
    '0.0.0',
    0,
    false,
    'bigint',
    'linux',
    false,
    2,
  ])
})

test('provides process as a commonjs module global', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = process.cwd()`,
    }),
  )
  expect(value).toBe('/workspace')
})

test('allows a dependency to declare a process binding', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/dependency.js': `const process = require('./process.js'); module.exports = process.name`,
        '/workspace/eslint.config.js': `module.exports = require('./dependency.js')`,
        '/workspace/process.js': `exports.name = 'local process module'`,
      },
      {
        '/workspace/dependency.js\0./process.js': '/workspace/process.js',
        '/workspace/eslint.config.js\0./dependency.js':
          '/workspace/dependency.js',
      },
    ),
  )
  expect(value).toBe('local process module')
})

test('provides a non-interactive tty shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = require('tty').isatty(2)`,
    }),
  )
  expect(value).toBe(false)
})

test('provides a readable stream shim for synchronous dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const { Readable } = require('stream'); const stream = new Readable(); const values = []; stream.on('data', value => values.push(value)); stream.push('value'); stream.push(null); module.exports = values`,
    }),
  )
  expect(value).toEqual(['value'])
})

test('provides the node global alias to config dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = [global.Array === Array, global.console === console, global.globalThis === globalThis]`,
    }),
  )
  expect(value).toEqual([true, true, true])
})

test('provides a SharedArrayBuffer fallback to config dependencies', () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedArrayBuffer',
  )!
  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    ...descriptor,
    value: undefined,
  })
  try {
    const value = LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `const buffer = new SharedArrayBuffer(4); module.exports = [buffer.byteLength, buffer instanceof SharedArrayBuffer]`,
      }),
    )
    expect(value).toEqual([4, true])
  } finally {
    Object.defineProperty(globalThis, 'SharedArrayBuffer', descriptor)
  }
})

test('provides node immediate timer shims to config dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const handle = setImmediate(() => {}); clearImmediate(handle); module.exports = [typeof setImmediate, typeof clearImmediate]`,
    }),
  )
  expect(value).toEqual(['function', 'function'])
})

test('provides deep strict equality to config dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const { isDeepStrictEqual } = require('node:util'); module.exports = [isDeepStrictEqual(['.ts'], ['.ts']), isDeepStrictEqual({ nested: [1] }, { nested: [2] })]`,
    }),
  )
  expect(value).toEqual([true, false])
})

test('provides node module builtin metadata', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const moduleApi = require('node:module'); module.exports = [moduleApi.isBuiltin('fs'), moduleApi.isBuiltin('http'), moduleApi.builtinModules.includes('worker_threads')]`,
    }),
  )
  expect(value).toEqual([true, false, true])
})

test('provides commonjs extension metadata', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = Object.keys(require.extensions)`,
    }),
  )
  expect(value).toEqual(['.js', '.json'])
})

test('provides a chainable crypto hash shim', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = require('node:crypto').createHash('md5').update('config').digest('hex')`,
    }),
  )
  expect(typeof value).toBe('string')
  expect(value).not.toHaveLength(0)
})

test('validates vm source without evaluating it', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const vm = require('vm'); globalThis.__eslintVmExecuted = false; vm.runInNewContext('globalThis.__eslintVmExecuted = true'); let rejected = false; try { vm.runInNewContext('const =') } catch { rejected = true }; module.exports = [globalThis.__eslintVmExecuted, rejected]`,
    }),
  )
  expect(value).toEqual([false, true])
})

test('prevents child process execution', () => {
  expect(() =>
    LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `module.exports = require('node:child_process').execFileSync('git')`,
      }),
    ),
  ).toThrow('Child processes are not available in the ESLint config sandbox')
})

test('supports commonjs EventEmitter subclasses', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const EventEmitter = require('events'); class Plugin extends EventEmitter {}; const plugin = new Plugin(); let called = false; plugin.on('load', () => { called = true }); plugin.emit('load'); module.exports = called`,
    }),
  )
  expect(value).toBe(true)
})

test('supports packages that initialize a worker during module load', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const { MessageChannel, Worker } = require('node:worker_threads'); const { port2 } = new MessageChannel(); const worker = new Worker('worker.js', { transferList: [port2] }); worker.unref(); module.exports = [{ worker }]`,
    }),
  )
  expect(value[0].worker).toBeDefined()
  expect(() => value[0].worker.postMessage({})).toThrow(
    'Worker threads are not available in the ESLint config sandbox',
  )
})

test('limits fs reads to preloaded virtual files', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/data.json': 'safe',
      '/workspace/eslint.config.js': `const fs = require('node:fs'); module.exports = fs.readFileSync('/workspace/data.json', 'utf8')`,
    }),
  )
  expect(value).toBe('safe')
})

test('exposes non-module workspace files with node buffer decoding', () => {
  const value = LoadModuleGraph.loadModuleGraph({
    ...graph({
      '/workspace/eslint.config.js': `module.exports = require('fs').readFileSync('/workspace/source.ts').toString('utf8')`,
    }),
    files: {
      '/workspace/source.ts': 'export const value = 1',
    },
  })
  expect(value).toBe('export const value = 1')
})

test('provides virtual fs stat and realpath helpers', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/data.json': 'safe',
      '/workspace/eslint.config.js': `const fs = require('fs'); module.exports = [fs.statSync('/workspace/data.json').isFile(), fs.statSync('/workspace').isDirectory(), fs.realpathSync.native('/workspace/../workspace')]`,
    }),
  )
  expect(value).toEqual([true, true, '/workspace'])
})

test('rejects fs reads outside the virtual graph', () => {
  expect(() =>
    LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `require('node:fs').readFileSync('/etc/passwd', 'utf8')`,
      }),
    ),
  ).toThrow('Virtual file is not available: /etc/passwd')
})

test('rejects modules absent from the graph', () => {
  expect(() =>
    LoadModuleGraph.loadModuleGraph(
      graph({
        '/workspace/eslint.config.js': `module.exports = require('http')`,
      }),
    ),
  ).toThrow("Module 'http' was not preloaded")
})

test('provides IP address helpers', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const net = require('node:net'); module.exports = [net.isIP('127.0.0.1'), net.isIP('::1'), net.isIP('example.com')]`,
    }),
  )
  expect(value).toEqual([4, 6, 0])
})

test('lets config modules catch missing optional dependencies', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `let loaded = true; try { require('optional-plugin') } catch { loaded = false }; module.exports = loaded`,
    }),
  )
  expect(value).toBe(false)
})

test('supports require.resolve for preloaded modules', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/eslint.config.js': `module.exports = require.resolve('./worker.js')`,
        '/workspace/worker.js': `module.exports = true`,
      },
      {
        '/workspace/eslint.config.js\0./worker.js': '/workspace/worker.js',
      },
    ),
  )
  expect(value).toBe('/workspace/worker.js')
})

test('supports virtual directory discovery and absolute dynamic requires', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `const fs = require('fs'); const path = require('path'); const rules = fs.readdirSync('/workspace/rules').map(file => require(path.join('/workspace/rules', file))); module.exports = rules`,
      '/workspace/rules/first.js': `module.exports = 'first'`,
      '/workspace/rules/second.js': `module.exports = 'second'`,
    }),
  )
  expect(value).toEqual(['first', 'second'])
})

test('resolves absolute dynamic requires without an extension', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = require('/workspace/rules/first')`,
      '/workspace/rules/first.js': `module.exports = 'first'`,
    }),
  )
  expect(value).toBe('first')
})

test('resolves relative dynamic requires without an extension', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph({
      '/workspace/eslint.config.js': `module.exports = require('./rules/first')`,
      '/workspace/rules/first.js': `module.exports = 'first'`,
    }),
  )
  expect(value).toBe('first')
})

test('reuses a known bare package resolution for a dynamic require', () => {
  const value = LoadModuleGraph.loadModuleGraph(
    graph(
      {
        '/workspace/config.js': `module.exports = require('example')`,
        '/workspace/dynamic.js': `module.exports = require('example')`,
        '/workspace/eslint.config.js': `require('./config.js'); module.exports = require('./dynamic.js')`,
        '/workspace/node_modules/example/index.js': `module.exports = 'example'`,
      },
      {
        '/workspace/config.js\0example':
          '/workspace/node_modules/example/index.js',
        '/workspace/eslint.config.js\0./config.js': '/workspace/config.js',
        '/workspace/eslint.config.js\0./dynamic.js': '/workspace/dynamic.js',
      },
    ),
  )
  expect(value).toBe('example')
})
