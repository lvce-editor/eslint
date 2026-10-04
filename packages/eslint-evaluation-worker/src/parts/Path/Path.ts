export const isUri = (path: string): boolean =>
  /^[a-z][a-z\d+.-]*:\/\//i.test(path)

const splitAuthority = (
  prefix: string,
  remainder: string,
): [string, string] => {
  const separator = remainder.indexOf('/')
  if (!prefix || separator === 0) {
    return ['', remainder]
  }
  if (separator === -1) {
    return [remainder, '']
  }
  return [remainder.slice(0, separator), remainder.slice(separator)]
}

export const normalize = (path: string): string => {
  if (
    path.startsWith('/') &&
    !path.endsWith('/') &&
    !/\\|\/(?:\/|\.{1,2}(?:\/|$))/.test(path)
  ) {
    return path
  }
  const normalizedSlashes = path.replaceAll('\\', '/')
  const match = /^([a-z][a-z\d+.-]*:\/\/)(.*)$/i.exec(normalizedSlashes)
  const prefix = match?.[1] ?? ''
  const remainder = match?.[2] ?? normalizedSlashes
  const [authority, pathValue] = splitAuthority(prefix, remainder)
  const parts: string[] = []
  for (const part of pathValue.split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      if (parts.length > 0) {
        parts.pop()
      }
    } else {
      parts.push(part)
    }
  }
  return `${prefix}${authority}/${parts.join('/')}`
}

export const dirname = (path: string): string => {
  const normalized = normalize(path)
  const match = /^([a-z][a-z\d+.-]*:\/\/)/i.exec(normalized)
  const authorityMatch = /^([a-z][a-z\d+.-]*:\/\/[^/]+\/)/i.exec(normalized)
  const root = authorityMatch?.[1] ?? (match ? `${match[1]}/` : '/')
  const index = normalized.lastIndexOf('/')
  return index < root.length ? root : normalized.slice(0, index)
}

export const basename = (path: string, suffix = ''): string => {
  const normalized = normalize(path)
  const value = normalized.slice(normalized.lastIndexOf('/') + 1)
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

export const toFileSystemPath = (path: string): string => {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    return path
  }
  return decodeURIComponent(new URL(path).pathname)
}

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
