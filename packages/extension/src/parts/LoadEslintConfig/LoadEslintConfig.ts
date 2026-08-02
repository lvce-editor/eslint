import type { FileChanges } from '@lvce-editor/api'
import { transform } from '@babel/standalone'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import { configFileNames } from '../FindEslintConfig/FindEslintConfig.ts'

export interface ModuleGraph {
  readonly entry: string
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

interface PackageJson {
  readonly browser?: string
  readonly exports?: Record<string, unknown> | string
  readonly main?: string
  readonly module?: string
}

const builtins = new Set([
  'assert',
  'fs',
  'fs/promises',
  'module',
  'os',
  'path',
  'process',
  'url',
  'util',
])
const extensions = ['', '.js', '.cjs', '.mjs', '.json']
const maxModuleCount = 512
const maxTotalBytes = 5 * 1024 * 1024
const requireRegex = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g
const cache = new Map<string, { entrySource: string; graph: ModuleGraph }>()

const toPath = (uri: string): string => {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(new URL(uri).pathname)
  }
  return uri
}

const getChangedPaths = (changes: Readonly<FileChanges>): readonly string[] => {
  return [
    ...(changes.changed ?? []),
    ...(changes.deleted ?? []),
    ...(changes.renamed ?? []).flat(),
  ].map((uri) => normalize(toPath(uri)))
}

const isConfigFile = (path: string): boolean => {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  return configFileNames.includes(fileName)
}

export const invalidateForFileChanges = (
  changes: Readonly<FileChanges>,
): boolean => {
  const changedPaths = getChangedPaths(changes)
  let shouldRefresh = changedPaths.some(isConfigFile)
  for (const [entry, cached] of cache) {
    const hasChangedModule = changedPaths.some(
      (path) => path === entry || Object.hasOwn(cached.graph.modules, path),
    )
    if (!hasChangedModule) {
      continue
    }
    cache.delete(entry)
    shouldRefresh = true
  }
  return shouldRefresh
}

const normalize = (path: string): string => {
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

const dirname = (path: string): string => {
  const normalized = normalize(path)
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

const join = (...parts: readonly string[]): string => normalize(parts.join('/'))

const isFile = async (path: string): Promise<boolean> => {
  try {
    const stat = await FileSystem.stat(path)
    return stat.isFile
  } catch {
    return false
  }
}

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const stat = await FileSystem.stat(path)
    return stat.isDirectory
  } catch {
    return false
  }
}

const readPackageJson = async (
  directory: string,
): Promise<PackageJson | undefined> => {
  const path = join(directory, 'package.json')
  if (!(await isFile(path))) {
    return undefined
  }
  const content = await FileSystem.readFile(path)

  return JSON.parse(content)
}

const selectExport = (value: any): string | undefined => {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(selectExport).find(Boolean)
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }
  return (
    selectExport(value.browser) ||
    selectExport(value.import) ||
    selectExport(value.require) ||
    selectExport(value.default)
  )
}

const resolveAsFile = async (
  candidate: string,
): Promise<string | undefined> => {
  for (const extension of extensions) {
    const path = `${candidate}${extension}`
    if (await isFile(path)) {
      return normalize(path)
    }
  }
  return undefined
}

const resolveAsFileOrDirectory = async (
  candidate: string,
  packageSubpath = '.',
): Promise<string | undefined> => {
  const file = await resolveAsFile(candidate)
  if (file) {
    return file
  }
  if (!(await isDirectory(candidate))) {
    return undefined
  }
  const packageJson = await readPackageJson(candidate)
  if (packageJson) {
    const exportMap =
      typeof packageJson.exports === 'object' ? packageJson.exports : undefined
    const exportsValue =
      packageSubpath === '.'
        ? exportMap?.['.'] || packageJson.exports
        : exportMap?.[packageSubpath]
    const entry =
      selectExport(exportsValue) ||
      (packageSubpath === '.' &&
        (packageJson.browser || packageJson.module || packageJson.main))
    if (typeof entry === 'string') {
      const resolvedEntry = await resolveAsFileOrDirectory(
        join(candidate, entry),
      )
      if (resolvedEntry) {
        return resolvedEntry
      }
    }
  }
  return resolveAsFile(join(candidate, 'index'))
}

const parsePackageSpecifier = (
  specifier: string,
): { packageName: string; subpath: string } => {
  const parts = specifier.split('/')
  const packageName = specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0]
  const rest = parts.slice(packageName.startsWith('@') ? 2 : 1).join('/')
  return { packageName, subpath: rest ? `./${rest}` : '.' }
}

/* eslint-disable sonarjs/cognitive-complexity */
const resolvePackage = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  const { packageName, subpath } = parsePackageSpecifier(specifier)
  let directory = dirname(parent)
  while (true) {
    const packageDirectory = join(directory, 'node_modules', packageName)
    if (await isDirectory(packageDirectory)) {
      if (subpath !== '.') {
        const packageJson = await readPackageJson(packageDirectory)
        const exportMap =
          typeof packageJson?.exports === 'object'
            ? packageJson.exports
            : undefined
        const exported = selectExport(exportMap?.[subpath])
        if (exported) {
          const resolvedExport = await resolveAsFileOrDirectory(
            join(packageDirectory, exported),
          )
          if (resolvedExport) {
            return resolvedExport
          }
        }
        return resolveAsFileOrDirectory(
          join(packageDirectory, subpath.slice(2)),
        )
      }
      return resolveAsFileOrDirectory(packageDirectory)
    }
    if (directory === '/') {
      return undefined
    }
    directory = dirname(directory)
  }
}
/* eslint-enable sonarjs/cognitive-complexity */

const resolveModule = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  const builtin = specifier.startsWith('node:') ? specifier.slice(5) : specifier
  if (builtins.has(builtin)) {
    return `node:${builtin}`
  }
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const candidate = specifier.startsWith('/')
      ? specifier
      : join(dirname(parent), specifier)
    return resolveAsFileOrDirectory(candidate)
  }
  return resolvePackage(parent, specifier)
}

const transpile = (path: string, source: string): string => {
  if (path.endsWith('.json')) {
    return source
  }
  const result = transform(source, {
    babelrc: false,
    configFile: false,
    filename: path,
    plugins: ['transform-modules-commonjs'],
    sourceMaps: false,
    sourceType: 'unambiguous',
  })
  if (!result.code) {
    throw new Error(`Failed to transform ESLint module: ${path}`)
  }
  return result.code
}

const getDependencies = (source: string): readonly string[] => {
  const dependencies = new Set<string>()
  for (const match of source.matchAll(requireRegex)) {
    dependencies.add(match[2])
  }
  return [...dependencies]
}

export const loadEslintConfig = async (
  configFilePath: string,
): Promise<ModuleGraph> => {
  const entry = normalize(configFilePath)
  const entrySource = await FileSystem.readFile(entry)
  const cached = cache.get(entry)
  if (cached?.entrySource === entrySource) {
    return cached.graph
  }
  const modules: Record<string, string> = {}
  const resolutions: Record<string, string> = {}
  let totalBytes = 0

  const visit = async (path: string, knownSource?: string): Promise<void> => {
    if (Object.hasOwn(modules, path)) {
      return
    }
    if (Object.keys(modules).length >= maxModuleCount) {
      throw new Error(
        `ESLint config exceeds the ${maxModuleCount} module limit`,
      )
    }
    const source = knownSource ?? (await FileSystem.readFile(path))
    totalBytes += source.length
    if (totalBytes > maxTotalBytes) {
      throw new Error('ESLint config exceeds the 5 MB module limit')
    }
    const transformed = transpile(path, source)
    modules[path] = transformed
    for (const specifier of getDependencies(transformed)) {
      const resolved = await resolveModule(path, specifier)
      if (!resolved) {
        throw new Error(`Cannot resolve module '${specifier}' from ${path}`)
      }
      resolutions[`${path}\0${specifier}`] = resolved
      if (!resolved.startsWith('node:')) {
        await visit(resolved)
      }
    }
  }

  await visit(entry, entrySource)
  const graph = { entry, modules, resolutions }
  cache.set(entry, { entrySource, graph })
  return graph
}
