export const normalize = (path: string): string => {
  const normalizedSlashes = path.replaceAll('\\\\', '/')
  const match = /^([a-z][a-z\d+.-]*:\/\/)(.*)$/i.exec(normalizedSlashes)
  const prefix = match?.[1] ?? ''
  const pathValue = match?.[2] ?? normalizedSlashes
  const parts: string[] = []
  for (const part of pathValue.split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return `${prefix}/${parts.join('/')}`
}

export const dirname = (path: string): string => {
  const normalized = normalize(path)
  const match = /^([a-z][a-z\d+.-]*:\/\/)/i.exec(normalized)
  const root = match ? `${match[1]}/` : '/'
  const index = normalized.lastIndexOf('/')
  return index < root.length ? root : normalized.slice(0, index)
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
