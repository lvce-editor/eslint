import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { parseArgs } from '../src/cli.ts'

const invocationDirectory = process.env['INIT_CWD'] || process.cwd()

await test('parses required benchmark options', () => {
  assert.deepEqual(
    parseArgs([
      '--repo',
      'https://example.com/repo.git',
      '--file',
      'src/file.ts',
    ]),
    {
      file: 'src/file.ts',
      headed: false,
      output: resolve(invocationDirectory, '.tmp', 'benchmark-results'),
      reload: false,
      repo: 'https://example.com/repo.git',
      timeout: 120_000,
    },
  )
})

await test('parses optional benchmark options', () => {
  assert.deepEqual(
    parseArgs([
      '--repo',
      '/tmp/repo',
      '--file',
      'src/file.ts',
      '--headed',
      '--output',
      'results',
      '--reload',
      '--timeout',
      '30000',
    ]),
    {
      file: 'src/file.ts',
      headed: true,
      output: resolve(invocationDirectory, 'results'),
      reload: true,
      repo: '/tmp/repo',
      timeout: 30_000,
    },
  )
})

await test('requires repo and file options', () => {
  assert.throws(() => parseArgs(['--file', 'src/file.ts']), /--repo/)
  assert.throws(() => parseArgs(['--repo', '/tmp/repo']), /--file/)
})

await test('rejects invalid options', () => {
  assert.throws(() => parseArgs(['--wat']), /Unknown argument/)
  assert.throws(() => parseArgs(['--repo']), /Missing value/)
  assert.throws(
    () =>
      parseArgs(['--repo', '/tmp/repo', '--file', 'file.ts', '--timeout', '0']),
    /positive integer/,
  )
})
