import * as CacheExpiration from '../CacheExpiration/CacheExpiration.ts'

const CacheName = 'eslint-module-analysis-v1'
const CacheKeyPrefix = 'https://eslint-module-analysis-cache.invalid/'

const pending = new Map<string, Promise<unknown>>()

const getCacheKey = (key: string): string =>
  `${CacheKeyPrefix}${encodeURIComponent(key)}`

const getCachedValue = async (key: string): Promise<unknown> => {
  try {
    const cache = await caches.open(CacheName)
    const response = await cache.match(getCacheKey(key))
    return response?.json()
  } catch {
    return undefined
  }
}

const setCachedValue = async (key: string, value: unknown): Promise<void> => {
  try {
    const content = JSON.stringify(value)
    const contentLength = new TextEncoder().encode(content).byteLength
    const cache = await caches.open(CacheName)
    await cache.put(
      getCacheKey(key),
      new Response(content, {
        headers: {
          'Content-Length': String(contentLength),
          'Content-Type': 'application/json',
          Expires: CacheExpiration.getExpirationDate(),
        },
      }),
    )
  } catch {
    // Persistent caching is an optimization; analysis remains the fallback.
  }
}

const loadOrCompute = async <T>(
  key: string,
  isValue: (value: unknown) => value is T,
  compute: () => T | Promise<T>,
): Promise<T> => {
  const cached = await getCachedValue(key)
  if (isValue(cached)) {
    return cached
  }
  const value = await compute()
  await setCachedValue(key, value)
  return value
}

export const getOrCompute = async <T>(
  key: string,
  isValue: (value: unknown) => value is T,
  compute: () => T | Promise<T>,
): Promise<T> => {
  const existing = pending.get(key)
  if (existing) {
    return existing as Promise<T>
  }
  const promise = loadOrCompute(key, isValue, compute)
  pending.set(key, promise)
  try {
    return await promise
  } finally {
    pending.delete(key)
  }
}
