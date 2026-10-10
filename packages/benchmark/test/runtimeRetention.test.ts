import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

await test('collects discarded runtime exports and their virtual file stores', () => {
  const moduleRuntimeUrl = new URL(
    '../../eslint-evaluation-worker/src/parts/ModuleRuntime/ModuleRuntime.ts',
    import.meta.url,
  ).href
  const graph = {
    entry: '/workspace/config.js',
    files: { '/workspace/source.txt': 'source' },
    id: 'retention',
    modules: {
      '/workspace/config.js': `const fs = require('node:fs'); Object.defineProperty(exports, 'source', { get: () => fs.readFileSync('/workspace/source.txt', 'utf8') })`,
    },
    resolutions: {},
  }
  // A fresh process provides explicit GC without keeping Jest's test objects
  // alive. Only a weak reference to the discarded getter export survives.
  const source = `
    import assert from 'node:assert/strict'
    import { createModuleRuntime } from ${JSON.stringify(moduleRuntimeUrl)}
    const evaluate = () => {
      const loaded = createModuleRuntime().evaluate(${JSON.stringify(graph)})
      assert.equal(loaded.exports.source, 'source')
      return new WeakRef(loaded.exports)
    }
    const reference = evaluate()
    for (let index = 0; index < 5; index++) {
      await new Promise(resolve => setImmediate(resolve))
      globalThis.gc()
    }
    assert.equal(reference.deref(), undefined, 'Discarded module runtime is still reachable')
  `
  assert.doesNotThrow(() =>
    execFileSync(
      process.execPath,
      ['--expose-gc', '--input-type=module', '--eval', source],
      { encoding: 'utf8' },
    ),
  )
})
