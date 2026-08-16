import { beforeEach, expect, jest, test } from '@jest/globals'
import * as ModuleGraphDependencies from '../src/parts/ModuleGraphDependencies/ModuleGraphDependencies.ts'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as ModuleResolutionWorker from '../src/parts/ModuleResolutionWorker/ModuleResolutionWorker.ts'

const configGraph: ModuleGraph = {
  entry: '/workspace/eslint.config.js',
  files: {},
  id: 'config-graph',
  modules: {
    '/workspace/eslint.config.js': '',
    '/workspace/config/shared.js': '',
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
  let finishFirst: () => void = () => {}
  const firstCanFinish = new Promise<void>((resolve) => {
    finishFirst = resolve
  })
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

test('invalidates a tracked dependency without retaining the worker', async () => {
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

  await expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///workspace/config/shared.js'],
    }),
  ).resolves.toBe(true)

  expect(invocations).toContainEqual([
    'ModuleResolution.invalidateCacheKeys',
    ['module:/workspace/eslint.config.js:file:///workspace/src/file.js'],
  ])
  expect(disposals).toHaveLength(2)
  expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
    true,
  )
  expect(
    ModuleGraphDependencies.getAffectedCacheKeys({
      changed: ['file:///workspace/config/shared.js'],
    }),
  ).toEqual([])
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

  await expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///outside/readme.md'],
    }),
  ).resolves.toBe(false)

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

  await expect(
    ModuleResolutionWorker.invalidateForFileChanges({
      changed: ['file:///workspace/new-rule.ts'],
    }),
  ).resolves.toBe(true)
})
