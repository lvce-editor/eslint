import assert from 'node:assert/strict'
import test from 'node:test'
import { getUserTimingDuration } from '../src/cpuProfile.ts'

await test('reads a user timing duration from a Chromium trace', () => {
  const trace = `{"traceEvents":[
{"name":"eslint-benchmark-lint","ph":"b","ts":1000},
{"name":"other","ph":"I","ts":2000},
{"name":"eslint-benchmark-lint","ph":"e","ts":82500}
]}`

  assert.equal(getUserTimingDuration(trace, 'eslint-benchmark-lint'), 81.5)
})

await test('returns undefined when a user timing measure is incomplete', () => {
  assert.equal(
    getUserTimingDuration(
      '{"name":"eslint-benchmark-lint","ph":"b","ts":1000}',
      'eslint-benchmark-lint',
    ),
    undefined,
  )
})
