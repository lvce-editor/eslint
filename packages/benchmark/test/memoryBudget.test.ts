import assert from 'node:assert/strict'
import test from 'node:test'
import type { HeapSummary } from '../src/heapSnapshot.ts'
import { assertMemoryBudget, parseMemoryBudget } from '../src/memoryBudget.ts'

const summary: HeapSummary = {
  duplicateLargeModuleScripts: [],
  evaluatorScriptSource: 30,
  retainedGraphSource: 15,
  stringShallowSize: 65,
  totalHeap: 160,
  typeScriptCatalogs: 0,
}

const budget = {
  evaluatorScriptSource: 33,
  retainedGraphSource: 17,
  stringShallowSize: 71,
  totalHeap: 170,
  typeScriptCatalogs: 0,
}

await test('accepts a heap summary within the memory budget', () => {
  assert.doesNotThrow(() => assertMemoryBudget(summary, budget))
})

await test('reports every exceeded memory category', () => {
  assert.throws(
    () =>
      assertMemoryBudget(summary, {
        ...budget,
        stringShallowSize: 64,
        totalHeap: 159,
      }),
    /stringShallowSize: 65 > 64 bytes[\s\S]*totalHeap: 160 > 159 bytes/,
  )
})

await test('validates memory budget keys and values', () => {
  assert.deepEqual(parseMemoryBudget(budget), budget)
  assert.throws(() => parseMemoryBudget([]), /JSON object/)
  assert.throws(
    () => parseMemoryBudget({ ...budget, unknown: 1 }),
    /Unknown memory budget key/,
  )
  assert.throws(
    () => parseMemoryBudget({ ...budget, totalHeap: -1 }),
    /non-negative integer/,
  )
  const { totalHeap: _, ...missingTotalHeap } = budget
  assert.throws(
    () => parseMemoryBudget(missingTotalHeap),
    /totalHeap must be a non-negative integer/,
  )
})
