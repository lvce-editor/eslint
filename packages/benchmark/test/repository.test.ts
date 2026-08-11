import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveBenchmarkFile } from '../src/repository.ts'

await test('resolves a file inside the repository', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'eslint-benchmark-test-'))
  try {
    await mkdir(join(repository, 'src'))
    await writeFile(join(repository, 'src', 'file.ts'), '')
    assert.equal(
      await resolveBenchmarkFile(repository, 'src/file.ts'),
      join(repository, 'src', 'file.ts'),
    )
  } finally {
    await rm(repository, { force: true, recursive: true })
  }
})

await test('rejects files outside the repository', async () => {
  await assert.rejects(
    resolveBenchmarkFile('/tmp/repository', '../file.ts'),
    /inside the repository/,
  )
  await assert.rejects(
    resolveBenchmarkFile('/tmp/repository', '/tmp/file.ts'),
    /relative/,
  )
})
