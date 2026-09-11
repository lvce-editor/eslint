const legacyCacheNames = [
  'eslint-config-files-cache',
  'eslint-compiled-module-graph-v2',
  'eslint-module-analysis-v1',
  'eslint-module-analysis-v2',
  'eslint-module-analysis-v3',
  'eslint-file-content-v1',
]

export const removeLegacyCaches = async (): Promise<void> => {
  await Promise.all(
    legacyCacheNames.map(async (name) => {
      try {
        await caches.delete(name)
      } catch {
        // Storage can be unavailable; retry cleanup on the next activation.
      }
    }),
  )
}
