import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeHeapSnapshot } from '../src/heapSnapshot.ts'

await test('does not count TypeScript source as a diagnostic catalog', () => {
  const strings = [
    '',
    '(function anonymous(global,process,clearImmediate,setImmediate,SharedArrayBuffer) { return diag(6917, "ALL_COMPILER_OPTIONS_6917", "ALL COMPILER OPTIONS") }',
    '{ const key = "ALL_COMPILER_OPTIONS_6917"; }',
    '{"source":"ALL_COMPILER_OPTIONS_6917"}',
  ]
  const summary = summarizeHeapSnapshot({
    edges: [],
    nodes: [0, 1, 300, 0, 0, 2, 100, 0, 0, 3, 80, 0],
    snapshot: {
      meta: {
        edge_fields: ['type', 'name_or_index', 'to_node'],
        node_fields: ['type', 'name', 'self_size', 'edge_count'],
        node_types: [['string'], [], [], []],
      },
    },
    strings,
  })

  assert.equal(summary.typeScriptCatalogs, 0)
  assert.equal(summary.evaluatorScriptSource, 300)
  assert.equal(summary.stringShallowSize, 480)
})

await test('summarizes string memory categories and duplicate scripts', () => {
  const largeSource = 'x'.repeat(300_000)
  const strings = [
    '',
    'graph',
    'modules',
    'record',
    '/workspace/module.js',
    largeSource,
    '(function anonymous(global,process,clearImmediate,setImmediate,SharedArrayBuffer) { source }',
    '{"ALL_COMPILER_OPTIONS_6917":"translated"}',
  ]
  const summary = summarizeHeapSnapshot({
    edges: [2, 2, 4, 2, 4, 8],
    nodes: [
      3, 1, 16, 1, 3, 3, 16, 1, 2, 5, 300_000, 0, 2, 5, 300_000, 0, 2, 6, 100,
      0, 2, 7, 80, 0,
    ],
    snapshot: {
      meta: {
        edge_fields: ['type', 'name_or_index', 'to_node'],
        node_fields: ['type', 'name', 'self_size', 'edge_count'],
        node_types: [['hidden', 'array', 'string', 'object'], [], [], []],
      },
    },
    strings,
  })

  assert.equal(summary.totalHeap, 600_212)
  assert.equal(summary.stringShallowSize, 600_180)
  assert.equal(summary.retainedGraphSource, 300_000)
  assert.equal(summary.evaluatorScriptSource, 100)
  assert.equal(summary.typeScriptCatalogs, 80)
  assert.deepEqual(summary.duplicateLargeModuleScripts, [
    {
      count: 2,
      preview: largeSource.slice(0, 120),
      shallowSize: 600_000,
    },
  ])
})
