import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileContentCache from '../src/parts/FileContentCache/FileContentCache.ts'

const match = jest.fn<Cache['match']>()
const put = jest.fn<Cache['put']>()
const open = jest.fn<CacheStorage['open']>()

beforeEach(() => {
  jest.clearAllMocks()
  open.mockResolvedValue({ match, put } as unknown as Cache)
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
})

test('gets text by content hash', async () => {
  match.mockResolvedValueOnce(new Response('content'))

  await expect(FileContentCache.getText('sample-hash')).resolves.toBe('content')
  expect(open).toHaveBeenCalledWith('eslint-file-content-v1')
  expect(match).toHaveBeenCalledWith(
    'https://eslint-file-cache.invalid/sample-hash',
  )
})

test('returns undefined when content is not cached', async () => {
  match.mockResolvedValueOnce(undefined)

  await expect(FileContentCache.getText('sample-hash')).resolves.toBeUndefined()
})

test('stores text by content hash', async () => {
  await FileContentCache.setText('sample-hash', 'content 🦄')

  expect(open).toHaveBeenCalledWith('eslint-file-content-v1')
  expect(put).toHaveBeenCalledTimes(1)
  const [key, response] = put.mock.calls[0]
  expect(key).toBe('https://eslint-file-cache.invalid/sample-hash')
  expect(response.headers.get('Content-Length')).toBe('12')
  expect(response.headers.get('Content-Type')).toBe('application/javascript')
  expect(Date.parse(response.headers.get('Expires') || '')).toBeGreaterThan(
    Date.now(),
  )
  await expect(response.text()).resolves.toBe('content 🦄')
})
