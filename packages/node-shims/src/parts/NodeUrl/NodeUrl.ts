export const createNodeUrl = () => ({
  fileURLToPath: (url: string | URL): string => {
    if (typeof url === 'string') {
      return url.replace('file://', '')
    }
    return url.pathname
  },
  pathToFileURL: (path: string): URL => new URL(`file://${path}`),
})
