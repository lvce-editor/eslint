import { beforeEach, expect, jest, test } from '@jest/globals'
import * as FileContentCache from '../src/parts/FileContentCache/FileContentCache.ts'

const match = jest.fn<Cache['match']>()
const put = jest.fn<Cache['put']>()
const open = jest.fn<CacheStorage['open']>()

beforeEach(() => {
  jest.resetAllMocks()
  FileContentCache.clearCache()
  open.mockResolvedValue({ match, put } as unknown as Cache)
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open },
  })
})

test('gets text by content hash', async () => {
  match.mockResolvedValueOnce(new Response('content'))

  await expect(FileContentCache.getText('sample-hash')).resolves.toBe('content')
  expect(open).toHaveBeenCalledWith('eslint-file-content-v2')
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

  expect(open).toHaveBeenCalledWith('eslint-file-content-v2')
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

test('shares one open cache across concurrent reads and writes', async () => {
  await Promise.all([
    FileContentCache.getText('first'),
    FileContentCache.getText('second'),
    FileContentCache.setText('third', 'content'),
  ])

  expect(open).toHaveBeenCalledTimes(1)
})

test('stops retrying unavailable storage and warns once', async () => {
  open.mockRejectedValue(new TypeError('Failed to fetch'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await expect(
      Promise.all([
        FileContentCache.getText('first'),
        FileContentCache.getText('second'),
      ]),
    ).resolves.toEqual([undefined, undefined])
    await expect(FileContentCache.getText('third')).resolves.toBeUndefined()
    await expect(
      FileContentCache.setText('third', 'content'),
    ).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
  }
})

test('falls back when a cached response body fails to read', async () => {
  match.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('Failed to fetch'))
        },
      }),
    ),
  )
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await expect(FileContentCache.getText('first')).resolves.toBeUndefined()
    await expect(FileContentCache.getText('second')).resolves.toBeUndefined()
    expect(match).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
  }
})

test('stops using storage after a failed write', async () => {
  put.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await expect(
      FileContentCache.setText('first', 'content'),
    ).resolves.toBeUndefined()
    await FileContentCache.setText('second', 'content')
    await expect(FileContentCache.getText('third')).resolves.toBeUndefined()
    expect(put).toHaveBeenCalledTimes(1)
    expect(match).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
  }
})

test('reopens storage after clearing a healthy cache', async () => {
  await FileContentCache.getText('first')
  FileContentCache.clearCache()
  await FileContentCache.getText('second')
  expect(open).toHaveBeenCalledTimes(2)
})

test('retries storage after clearing a disabled cache', async () => {
  open.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await FileContentCache.getText('first')
    FileContentCache.clearCache()
    match.mockResolvedValueOnce(new Response('recovered'))
    await expect(FileContentCache.getText('second')).resolves.toBe('recovered')
    expect(open).toHaveBeenCalledTimes(2)
  } finally {
    warn.mockRestore()
  }
})

test('an old failed read does not disable a newly cleared cache', async () => {
  const { promise, reject } = Promise.withResolvers<Response | undefined>()
  match.mockReturnValueOnce(promise)
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const first = FileContentCache.getText('first')
    await Promise.resolve()
    FileContentCache.clearCache()
    reject(new TypeError('Failed to fetch'))
    await expect(first).resolves.toBeUndefined()
    match.mockResolvedValueOnce(new Response('recovered'))
    await expect(FileContentCache.getText('second')).resolves.toBe('recovered')
    expect(open).toHaveBeenCalledTimes(2)
  } finally {
    warn.mockRestore()
  }
})

test('compresses large file content and restores the original unicode text', async () => {
  const content = 'const example = "repeated source 🦄";\n'.repeat(10_000)
  await FileContentCache.setText('large-file', content)
  const response = put.mock.calls[0][1]
  const storedBytes = (await response.clone().arrayBuffer()).byteLength
  expect(storedBytes).toBeLessThan(
    new TextEncoder().encode(content).byteLength / 4,
  )
  expect(response.headers.get('Content-Length')).toBe(String(storedBytes))
  match.mockResolvedValueOnce(response)
  await expect(FileContentCache.getText('large-file')).resolves.toBe(content)
})
