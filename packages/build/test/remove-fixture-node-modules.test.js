import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { removeFixtureNodeModules } from '../src/remove-fixture-node-modules.js'

test('removes generated fixture node_modules links', async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'eslint-build-fixtures-'),
  )
  try {
    const fixturesPath = join(temporaryDirectory, 'fixtures')
    const fixturePath = join(fixturesPath, 'fixture')
    const nodeModulesPath = join(temporaryDirectory, 'node_modules')
    await mkdir(fixturePath, { recursive: true })
    await mkdir(nodeModulesPath)
    await symlink(nodeModulesPath, join(fixturePath, 'node_modules'), 'dir')

    await removeFixtureNodeModules(fixturesPath)

    await assert.rejects(access(join(fixturePath, 'node_modules')))
    await access(nodeModulesPath)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
})
