import { beforeEach, expect, jest, test } from '@jest/globals'
import * as ModuleAnalysisCache from '../src/parts/ModuleAnalysisCache/ModuleAnalysisCache.ts'

const cacheEntries = new Map<string, Response>()
const getRequestKey = (key: string | Request): string =>
  typeof key === 'string' ? key : key.url
const match = jest.fn(async (key: string | Request) =>
  cacheEntries.get(getRequestKey(key))?.clone(),
)
const put = jest.fn(async (key: string | Request, response: Response) => {
  cacheEntries.set(getRequestKey(key), response.clone())
})
const open = jest.fn(
  async (_cacheName: string) => ({ match, put }) as unknown as Cache,
)

interface Analysis {
  readonly source: string
}

const isAnalysis = (value: unknown): value is Analysis => {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as Partial<Analysis>).source === 'string'
  )
}

beforeEach(() => {
  cacheEntries.clear()
  jest.clearAllMocks()
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
})

test('stores computed analysis and reuses it from cache storage', async () => {
  const analysis = { source: 'transformed ✓' }
  const content = JSON.stringify(analysis)
  const contentLength = new TextEncoder().encode(content).byteLength
  const compute = jest.fn(async () => analysis)

  await expect(
    ModuleAnalysisCache.getOrCompute('module:.js:hash', isAnalysis, compute),
  ).resolves.toEqual(analysis)
  await expect(
    ModuleAnalysisCache.getOrCompute('module:.js:hash', isAnalysis, compute),
  ).resolves.toEqual(analysis)

  expect(compute).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenCalledWith('eslint-module-analysis-v1')
  expect(put).toHaveBeenCalledTimes(1)
  expect(put.mock.calls[0][0]).toBe(
    'https://eslint-module-analysis-cache.invalid/module%3A.js%3Ahash',
  )
  expect(
    Date.parse(put.mock.calls[0][1].headers.get('Expires') || ''),
  ).toBeGreaterThan(Date.now())
  expect(put.mock.calls[0][1].headers.get('Content-Length')).toBe(
    String(contentLength),
  )
})

test('coalesces concurrent analysis for the same content hash', async () => {
  const { promise: started, resolve: markStarted } =
    Promise.withResolvers<void>()
  const { promise: computation, resolve: finish } =
    Promise.withResolvers<Analysis>()
  const compute = jest.fn(() => {
    markStarted()
    return computation
  })

  const first = ModuleAnalysisCache.getOrCompute(
    'module:.ts:hash',
    isAnalysis,
    compute,
  )
  const second = ModuleAnalysisCache.getOrCompute(
    'module:.ts:hash',
    isAnalysis,
    compute,
  )
  await started
  finish({ source: 'transformed' })

  await expect(Promise.all([first, second])).resolves.toEqual([
    { source: 'transformed' },
    { source: 'transformed' },
  ])
  expect(compute).toHaveBeenCalledTimes(1)
  expect(put).toHaveBeenCalledTimes(1)
})

test('recomputes invalid cached analysis', async () => {
  cacheEntries.set(
    'https://eslint-module-analysis-cache.invalid/module%3A.js%3Ahash',
    Response.json({ source: 42 }),
  )
  const compute = jest.fn(async () => ({ source: 'transformed' }))

  await expect(
    ModuleAnalysisCache.getOrCompute('module:.js:hash', isAnalysis, compute),
  ).resolves.toEqual({ source: 'transformed' })

  expect(compute).toHaveBeenCalledTimes(1)
  expect(put).toHaveBeenCalledTimes(1)
})

test('falls back when cache storage is unavailable', async () => {
  open.mockRejectedValueOnce(new Error('Cache unavailable'))
  const compute = jest.fn(async () => ({ source: 'transformed' }))

  await expect(
    ModuleAnalysisCache.getOrCompute('module:.js:hash', isAnalysis, compute),
  ).resolves.toEqual({ source: 'transformed' })

  expect(compute).toHaveBeenCalledTimes(1)
})
