const CacheName = 'eslint-file-content-v1'
const CacheKeyPrefix = 'https://eslint-file-cache.invalid/'

const getKey = (hash: string): string => {
  return `${CacheKeyPrefix}${hash}`
}

export const getText = async (hash: string): Promise<string | undefined> => {
  const cache = await caches.open(CacheName)
  const response = await cache.match(getKey(hash))
  return response?.text()
}

export const setText = async (hash: string, content: string): Promise<void> => {
  const cache = await caches.open(CacheName)
  await cache.put(getKey(hash), new Response(content))
}
