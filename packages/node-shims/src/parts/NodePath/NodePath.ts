interface NodePath {
  basename: (path: string, extension?: string) => string
  readonly delimiter: ':'
  dirname: (path: string) => string
  extname: (path: string) => string
  isAbsolute: (path: string) => boolean
  join: (...paths: string[]) => string
  normalize: (path: string) => string
  posix: NodePath | null
  relative: (from: string, to: string) => string
  resolve: (...paths: string[]) => string
  readonly sep: '/'
  win32: NodePath | null
}

export const createNodePath = (): NodePath => {
  const pathModule: NodePath = {
    basename: (path, extension) => {
      const parts = path.split('/')
      let name = parts.at(-1) || ''
      if (extension && name.endsWith(extension)) {
        name = name.slice(0, -extension.length)
      }
      return name
    },
    delimiter: ':',
    dirname: (path) => {
      const parts = path.split('/')
      parts.pop()
      return parts.join('/') || '/'
    },
    extname: (path) => {
      const lastDot = path.lastIndexOf('.')
      const lastSlash = path.lastIndexOf('/')
      return lastDot > lastSlash ? path.slice(lastDot) : ''
    },
    isAbsolute: (path) => path.startsWith('/'),
    join: (...paths) => paths.filter(Boolean).join('/').replaceAll(/\/+/g, '/'),
    normalize: (path) => {
      return path
        .replaceAll(/\/+/g, '/')
        .replaceAll('/./', '/')
        .replace(/\/\.$/, '')
    },
    posix: null,
    relative: (from, to) => {
      if (from === to) return ''
      const fromParts = from.split('/').filter(Boolean)
      const toParts = to.split('/').filter(Boolean)
      let commonLength = 0
      for (
        let index = 0;
        index < Math.min(fromParts.length, toParts.length);
        index++
      ) {
        if (fromParts[index] === toParts[index]) {
          commonLength++
        } else {
          break
        }
      }
      const upLevels = fromParts.length - commonLength
      const downPath = toParts.slice(commonLength).join('/')
      return '../'.repeat(upLevels) + downPath
    },
    resolve: (...paths) => {
      let resolved = '/'
      for (const path of paths) {
        if (path.startsWith('/')) {
          resolved = path
        } else {
          resolved = resolved === '/' ? `/${path}` : `${resolved}/${path}`
        }
      }
      return resolved.replaceAll(/\/+/g, '/')
    },
    sep: '/',
    win32: null,
  }

  pathModule.posix = pathModule
  pathModule.win32 = pathModule
  return pathModule
}
