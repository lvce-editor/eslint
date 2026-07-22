export const normalize = (path: string): string => {
  const parts: string[] = []
  for (const part of path.replaceAll('\\\\', '/').split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return `/${parts.join('/')}`
}

export const dirname = (path: string): string => {
  const normalized = normalize(path)
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

export const basename = (path: string, suffix = ''): string => {
  const value = normalize(path).split('/').at(-1) || ''
  return suffix && value.endsWith(suffix)
    ? value.slice(0, -suffix.length)
    : value
}

export const extname = (path: string): string => {
  const value = basename(path)
  const index = value.lastIndexOf('.')
  return index <= 0 ? '' : value.slice(index)
}

export const join = (...parts: readonly string[]): string =>
  normalize(parts.join('/'))

export const resolve = (...parts: readonly string[]): string => join(...parts)

export const relative = (from: string, to: string): string => {
  const fromParts = normalize(from).split('/').filter(Boolean)
  const toParts = normalize(to).split('/').filter(Boolean)
  let index = 0
  while (fromParts[index] === toParts[index] && index < fromParts.length) {
    index++
  }
  return [
    ...fromParts.slice(index).map(() => '..'),
    ...toParts.slice(index),
  ].join('/')
}
