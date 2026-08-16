import { beforeEach, expect, jest, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as ModuleGraphDependencies from '../src/parts/ModuleGraphDependencies/ModuleGraphDependencies.ts'
import * as ModuleResolutionWorker from '../src/parts/ModuleResolutionWorker/ModuleResolutionWorker.ts'

const configGraph: ModuleGraph = {
  entry: '/workspace/eslint.config.js',
  files: {},
  id: 'config-graph',
  modules: {
    '/workspace/config/shared.js': '',
    '/workspace/eslint.config.js': '',
  },
  resolutions: {},
}

const eslintGraph: ModuleGraph = {
  entry: '/workspace/node_modules/eslint/index.js',
  files: {},
  id: 'eslint-graph',
  modules: {
    '/workspace/node_modules/eslint/index.js': '',
  },
  resolutions: {},
}

beforeEach(() => {
  ModuleResolutionWorker.state.activeSessions = 0
  ModuleResolutionWorker.state.disposePromise = undefined
  ModuleResolutionWorker.state.invalidatedCacheKeys.clear()
  ModuleResolutionWorker.state.rpcPromise = undefined
  ModuleGraphDependencies.clear()
})

test('disposes the worker after a resolution session', async () => {
  const dispose = jest.fn<() => void>()
  const invoke = jest.fn(async (method: string) =>
    method === 'ModuleResolution.loadEslintConfig' ? configGraph : eslintGraph,
  )
  const createRpc = jest.fn(async () => ({
    dispose,
    invoke,
  }))
  ModuleResolutionWorker.state.createRpc = createRpc

  await ModuleResolutionWorker.runInSession(async () => {
    await ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    )
    await ModuleResolutionWorker.loadEslintModule(
      'file:///workspace/src/file.js',
      'file:///workspace/eslint.config.js',
    )
  })

  expect(createRpc).toHaveBeenCalledTimes(1)
  expect(invoke).toHaveBeenCalledWith('Worker.dispose')
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(ModuleResolutionWorker.state.rpcPromise).toBeUndefined()
})

test('keeps the worker alive until concurrent sessions complete', async () => {
  const dispose = jest.fn<() => void>()
  ModuleResolutionWorker.state.createRpc = async () => ({
    dispose,
    invoke: async () => configGraph,
  })
  const { promise: firstCanFinish, resolve: finishFirst } =
    Promise.withResolvers<void>()
  const first = ModuleResolutionWorker.runInSession(async () => {
    await ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
    )
    await firstCanFinish
  })
  const second = ModuleResolutionWorker.runInSession(async () => {
    await ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
    )
  })

  await second
  expect(dispose).not.toHaveBeenCalled()
  finishFirst()
  await first
  expect(dispose).toHaveBeenCalledTimes(1)
})

test('defers persistent invalidation until the next resolution', async () => {
  const invocations: unknown[] = []
  const disposals: Array<ReturnType<typeof jest.fn<() => void>>> = []
  ModuleResolutionWorker.state.createRpc = async () => {
    const dispose = jest.fn<() => void>()
    disposals.push(dispose)
    return {
      dispose,
      invoke: async (method, ...params) => {
        invocations.push([method, ...params])
        return configGraph
      },
    }
  }
  await ModuleResolutionWorker.runInSession(() =>
    ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    ),
  )

  expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///workspace/config/shared.js'],
    }),
  ).toBe(true)

  expect(disposals).toHaveLength(1)
  await ModuleResolutionWorker.runInSession(() =>
    ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    ),
  )
  expect(invocations.slice(-3)).toEqual([
    [
      'ModuleResolution.invalidateCacheKeys',
      [
        'module:file:///workspace/eslint.config.js:file:///workspace/src/file.js',
      ],
    ],
    [
      'ModuleResolution.loadEslintConfig',
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    ],
    ['Worker.dispose'],
  ])
  expect(disposals).toHaveLength(2)
  expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
    true,
  )
  expect(
    ModuleGraphDependencies.getAffectedCacheKeys({
      changed: ['file:///workspace/config/shared.js'],
    }),
  ).toEqual([
    'module:file:///workspace/eslint.config.js:file:///workspace/src/file.js',
  ])
  expect(ModuleResolutionWorker.state.rpcPromise).toBeUndefined()
})

test('does not restart the worker for an unrelated file change', async () => {
  const createRpc = jest.fn(async () => ({
    dispose: () => {},
    invoke: async () => configGraph,
  }))
  ModuleResolutionWorker.state.createRpc = createRpc
  await ModuleResolutionWorker.runInSession(() =>
    ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    ),
  )

  expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///outside/readme.md'],
    }),
  ).toBe(false)

  expect(createRpc).toHaveBeenCalledTimes(1)
})

test('invalidates when a workspace module is created', async () => {
  ModuleResolutionWorker.state.createRpc = async () => ({
    dispose: () => {},
    invoke: async (method: string) =>
      method === 'ModuleResolution.loadEslintConfig' ? configGraph : undefined,
  })
  await ModuleResolutionWorker.runInSession(() =>
    ModuleResolutionWorker.loadEslintConfig(
      'file:///workspace/eslint.config.js',
      'file:///workspace/src/file.js',
    ),
  )

  expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///workspace/new-rule.ts'],
    }),
  ).toBe(true)
})
