import { beforeEach, expect, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as LoadEslint from '../src/parts/LoadEslint/LoadEslint.ts'
import * as ModuleResolutionWorker from '../src/parts/ModuleResolutionWorker/ModuleResolutionWorker.ts'

const createGraph = (source: string, id = 'eslint-graph'): ModuleGraph => ({
  entry: '/workspace/node_modules/eslint/index.js',
  files: {},
  id,
  modules: {
    '/workspace/node_modules/eslint/index.js': source,
  },
  resolutions: {},
})

const setRpcResult = (result: ModuleGraph): void => {
  ModuleResolutionWorker.state.createRpc = async () => ({
    invoke: async () => structuredClone(result),
  })
}

beforeEach(() => {
  LoadEslint.clearCache()
  ModuleResolutionWorker.state.rpcPromise = undefined
})

test('loads Linter from the module graph worker result', async () => {
  setRpcResult(
    createGraph(
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    ),
  )

  const Linter = await LoadEslint.loadEslint('/workspace/src/file.js')

  expect(Linter.name).toBe('ProjectLinter')
})

test('requests the project ESLint graph from the module resolution worker', async () => {
  const invocations: unknown[] = []
  const graph = createGraph(
    'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
  )
  ModuleResolutionWorker.state.createRpc = async () => ({
    invoke: async (method, ...params) => {
      invocations.push([method, ...params])
      return graph
    },
  })

  await LoadEslint.loadEslint('/workspace/src/file.js')

  expect(invocations).toEqual([
    ['ModuleResolution.loadEslintModule', '/workspace/src/file.js'],
  ])
})

test('propagates module resolution worker errors', async () => {
  ModuleResolutionWorker.state.createRpc = async () => ({
    invoke: async () => {
      throw new Error(
        'Cannot find ESLint in project node_modules for /missing-workspace/src/file.js',
      )
    },
  })

  await expect(
    LoadEslint.loadEslint('/missing-workspace/src/file.js'),
  ).rejects.toThrow(
    'Cannot find ESLint in project node_modules for /missing-workspace/src/file.js',
  )
})

test('rejects a project eslint package without Linter', async () => {
  setRpcResult(createGraph('module.exports = {}'))

  await expect(
    LoadEslint.loadEslint('/invalid-workspace/file.js'),
  ).rejects.toThrow('Project ESLint module does not export Linter')
})

test('reuses an evaluated module graph after structured cloning', async () => {
  setRpcResult(
    createGraph(
      'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
      'stable-graph-id',
    ),
  )

  const first = await LoadEslint.loadEslint('/workspace/src/first.js')
  const second = await LoadEslint.loadEslint('/workspace/src/second.js')

  expect(second).toBe(first)
})
