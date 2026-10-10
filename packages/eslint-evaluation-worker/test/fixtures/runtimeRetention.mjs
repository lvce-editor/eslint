import assert from 'node:assert/strict'
import * as ModuleRuntime from '../../src/parts/ModuleRuntime/ModuleRuntime.ts'

// Keep only a weak reference to an export that belongs to a discarded runtime.
// Creating builtins must not leave the runtime rooted through the assert shim.
const evaluate = () => {
  const runtime = ModuleRuntime.createModuleRuntime()
  const graph = runtime.evaluate({
    entry: '/workspace/config.js',
    files: { '/workspace/source.txt': 'source' },
    id: 'retention',
    modules: {
      '/workspace/config.js': `const fs = require('node:fs'); Object.defineProperty(exports, 'source', { get: () => fs.readFileSync('/workspace/source.txt', 'utf8') })`,
    },
    resolutions: {},
  })
  assert.equal(graph.exports.source, 'source')
  return new WeakRef(graph.exports)
}
const reference = evaluate()
for (let index = 0; index < 5; index++) {
  await new Promise((resolve) => setImmediate(resolve))
  globalThis.gc()
}
assert.equal(
  reference.deref(),
  undefined,
  'Discarded module runtime is still reachable',
)
