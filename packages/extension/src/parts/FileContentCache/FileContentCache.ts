import { VError } from '@lvce-editor/verror'
import * as CacheResponse from '../CacheResponse/CacheResponse.ts'
import * as Logger from '../Logger/Logger.ts'

const CacheName = 'eslint-file-content-v2'
const CacheKeyPrefix = 'https://eslint-file-cache.invalid/'
const ContentType = 'application/javascript'

interface CacheState {
  cachePromise?: Promise<Cache>
  disabled: boolean
}

const state: { current: CacheState } = { current: { disabled: false } }

export const clearCache = (): void => {
  state.current = { disabled: false }
}

const getKey = (hash: string): string => {
  return `${CacheKeyPrefix}${hash}`
}

const getCache = (current: CacheState): Promise<Cache> | undefined => {
  if (current.disabled) {
    return undefined
  }
  current.cachePromise ??= caches.open(CacheName)
  return current.cachePromise
}

const disableCache = (current: CacheState, error: unknown): void => {
  if (current.disabled) {
    return
  }
  current.disabled = true
  current.cachePromise = undefined
  Logger.warn(
    'ESLint file cache is unavailable; using direct file reads until the cache is cleared or the extension restarts.',
    error,
  )
}

export const getText = async (hash: string): Promise<string | undefined> => {
  const { current } = state
  try {
    const cache = await getCache(current)
    if (!cache || current.disabled) {
      return undefined
    }
    const response = await cache.match(getKey(hash))
    return response ? await CacheResponse.readText(response) : undefined
  } catch (error) {
    disableCache(
      current,
      new VError(error, `Failed to read ESLint file cache entry ${hash}`),
    )
    return undefined
  }
}

export const setText = async (hash: string, content: string): Promise<void> => {
  const { current } = state
  try {
    const cache = await getCache(current)
    if (!cache || current.disabled) {
      return
    }
    const response = await CacheResponse.create(content, ContentType)
    await cache.put(getKey(hash), response)
  } catch (error) {
    disableCache(current, error)
  }
}
