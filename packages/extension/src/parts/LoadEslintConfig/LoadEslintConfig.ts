import type { FileChanges } from '@lvce-editor/api'
import { packages, transform } from '@babel/standalone'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import { configFileNames } from '../FindEslintConfig/FindEslintConfig.ts'

export interface ModuleGraph {
  readonly entry: string
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

interface PackageJson {
  readonly browser?: Readonly<Record<string, string | false>> | string
  readonly exports?: Record<string, unknown> | string
  readonly main?: string
  readonly module?: string
}

type FileType = 'directory' | 'file' | 'missing'

const builtins = new Set([
  'assert',
  'assert/strict',
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'url',
  'util',
  'util/types',
  'worker_threads',
])
const extensions = ['', '.js', '.cjs', '.mjs', '.json']
const maxModuleCount = 8192
const maxTotalBytes = 64 * 1024 * 1024
const cache = new Map<string, { entrySource: string; graph: ModuleGraph }>()
const fileTypeCache = new Map<string, Promise<FileType>>()
const packageJsonCache = new Map<string, Promise<PackageJson | undefined>>()

const clearResolutionCaches = (): void => {
  fileTypeCache.clear()
  packageJsonCache.clear()
}

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
  if (shouldRefresh) {
    clearResolutionCaches()
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

const getFileType = async (path: string): Promise<FileType> => {
  const normalized = normalize(path)
  const cached = fileTypeCache.get(normalized)
  if (cached) {
    return cached
  }
  const result = (async (): Promise<FileType> => {
    try {
      const stat = await FileSystem.stat(normalized)
      if (stat.isFile) {
        return 'file'
      }
      return stat.isDirectory ? 'directory' : 'missing'
    } catch {
      return 'missing'
    }
  })()
  fileTypeCache.set(normalized, result)
  return result
}

const isFile = async (path: string): Promise<boolean> =>
  (await getFileType(path)) === 'file'

const isDirectory = async (path: string): Promise<boolean> =>
  (await getFileType(path)) === 'directory'

const readPackageJson = async (
  directory: string,
): Promise<PackageJson | undefined> => {
  const normalized = normalize(directory)
  const cached = packageJsonCache.get(normalized)
  if (cached) {
    return cached
  }
  const result = (async (): Promise<PackageJson | undefined> => {
    const path = join(normalized, 'package.json')
    if (!(await isFile(path))) {
      return undefined
    }
    const content = await FileSystem.readFile(path)
    return JSON.parse(content)
  })()
  packageJsonCache.set(normalized, result)
  return result
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
    selectExport(value.worker) ||
    selectExport(value.require) ||
    selectExport(value.import) ||
    selectExport(value.browser) ||
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
    const browserEntry =
      typeof packageJson.browser === 'string' ? packageJson.browser : undefined
    const entry =
      selectExport(exportsValue) ||
      (packageSubpath === '.' &&
        (browserEntry || packageJson.module || packageJson.main))
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

const resolveBrowserReplacement = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  let directory = dirname(parent)
  while (directory !== '/') {
    const packageJson = await readPackageJson(directory)
    if (packageJson) {
      const { browser } = packageJson
      if (!browser || typeof browser === 'string') {
        return undefined
      }
      const replacement = browser[specifier]
      return typeof replacement === 'string'
        ? resolveAsFileOrDirectory(join(directory, replacement))
        : undefined
    }
    directory = dirname(directory)
  }
  return undefined
}

const resolveModule = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  const browserReplacement = await resolveBrowserReplacement(parent, specifier)
  if (browserReplacement) {
    return browserReplacement
  }
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

type Dependency = {
  readonly optional: boolean
  readonly specifier: string
}

type DependencyAnalysis = {
  readonly dependencies: readonly Dependency[]
  readonly usesLazyLoadingRuleMap: boolean
  readonly usesReaddirSync: boolean
}

const functionExpressionTypes = [
  'ArrowFunctionExpression',
  'FunctionExpression',
]

const nonInvokedFunctionTypes = [
  ...functionExpressionTypes,
  'ClassMethod',
  'ClassPrivateMethod',
  'FunctionDeclaration',
  'ObjectMethod',
]

const exportedFunctionTypes = [
  ...functionExpressionTypes,
  'FunctionDeclaration',
]

const getInvokedFunction = (value: any): any => {
  if (value.type !== 'CallExpression') {
    return undefined
  }
  const { callee } = value
  if (functionExpressionTypes.includes(callee?.type)) {
    return callee
  }
  if (
    callee?.type === 'MemberExpression' &&
    functionExpressionTypes.includes(callee.object?.type)
  ) {
    return callee.object
  }
  return undefined
}

/* eslint-disable sonarjs/cognitive-complexity */
const getDependencies = (ast: unknown): DependencyAnalysis => {
  const dependencies = new Map<string, boolean>()
  const seen = new WeakSet<object>()
  let usesLazyLoadingRuleMap = false
  let usesReaddirSync = false
  const addDependency = (specifier: string, optional: boolean): void => {
    const previous = dependencies.get(specifier)
    dependencies.set(
      specifier,
      previous === undefined ? optional : previous && optional,
    )
  }
  const visit = (value: any, optional = false): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) {
      return
    }
    seen.add(value)
    const invokedFunction = getInvokedFunction(value)
    if (invokedFunction) {
      visit(invokedFunction.body, optional)
      const arguments_ = value.arguments ?? []
      for (const argument of arguments_) {
        visit(argument, optional)
      }
      return
    }
    if (
      value.type === 'NewExpression' &&
      value.callee?.type === 'Identifier' &&
      value.callee.name === 'LazyLoadingRuleMap'
    ) {
      usesLazyLoadingRuleMap = true
    }
    if (nonInvokedFunctionTypes.includes(value.type)) {
      return
    }
    if (value.type === 'TryStatement') {
      visit(value.block, true)
      visit(value.handler, optional)
      visit(value.finalizer, optional)
      return
    }
    const isRequire =
      value.callee?.type === 'Identifier' && value.callee.name === 'require'
    const isRequireResolve =
      value.callee?.type === 'MemberExpression' &&
      value.callee.object?.type === 'Identifier' &&
      value.callee.object.name === 'require' &&
      value.callee.property?.type === 'Identifier' &&
      value.callee.property.name === 'resolve'
    const directCallee =
      value.callee?.type === 'SequenceExpression'
        ? value.callee.expressions.at(-1)
        : value.callee
    if (
      value.type === 'CallExpression' &&
      ((directCallee?.type === 'Identifier' &&
        directCallee.name === 'readdirSync') ||
        (directCallee?.type === 'MemberExpression' &&
          directCallee.property?.type === 'Identifier' &&
          directCallee.property.name === 'readdirSync'))
    ) {
      usesReaddirSync = true
    }
    if (
      value.type === 'CallExpression' &&
      (isRequire || isRequireResolve) &&
      value.arguments?.length === 1 &&
      value.arguments[0]?.type === 'StringLiteral'
    ) {
      addDependency(value.arguments[0].value, optional)
    }
    const importTypes = [
      'ExportAllDeclaration',
      'ExportNamedDeclaration',
      'ImportDeclaration',
    ]
    if (
      importTypes.includes(value.type) &&
      value.source?.type === 'StringLiteral'
    ) {
      addDependency(value.source.value, optional)
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          visit(item, optional)
        }
      } else {
        visit(child, optional)
      }
    }
  }
  visit(ast)
  const { program } = ast as any
  const functions = new Map<string, any>()
  const programBody = program?.body ?? []
  for (const statement of programBody) {
    if (statement.type === 'FunctionDeclaration' && statement.id?.name) {
      functions.set(statement.id.name, statement)
    }
  }
  for (const statement of programBody) {
    const expression =
      statement.type === 'ExpressionStatement'
        ? statement.expression
        : undefined
    const isModuleExports =
      expression?.type === 'AssignmentExpression' &&
      expression.left?.type === 'MemberExpression' &&
      expression.left.object?.type === 'Identifier' &&
      expression.left.object.name === 'module' &&
      expression.left.property?.type === 'Identifier' &&
      expression.left.property.name === 'exports'
    if (!isModuleExports) {
      continue
    }
    const exportedFunction =
      expression.right?.type === 'Identifier'
        ? functions.get(expression.right.name)
        : expression.right
    if (exportedFunctionTypes.includes(exportedFunction?.type)) {
      visit(exportedFunction.body)
    }
  }
  return {
    dependencies: Array.from(dependencies, ([specifier, optional]) => ({
      optional,
      specifier,
    })),
    usesLazyLoadingRuleMap,
    usesReaddirSync,
  }
}
/* eslint-enable sonarjs/cognitive-complexity */

const transpile = (
  path: string,
  source: string,
): DependencyAnalysis & { source: string } => {
  if (path.endsWith('.json')) {
    return {
      dependencies: [],
      source,
      usesLazyLoadingRuleMap: false,
      usesReaddirSync: false,
    }
  }
  const ast = packages.parser.parse(source, {
    sourceType: 'unambiguous',
  })
  const analysis = getDependencies(ast)
  if (ast.program.sourceType !== 'module') {
    return { ...analysis, source }
  }
  const result = transform(source, {
    babelrc: false,
    comments: false,
    configFile: false,
    filename: path,
    plugins: ['transform-modules-commonjs'],
    sourceMaps: false,
    sourceType: 'unambiguous',
  })
  if (!result.code) {
    throw new Error(`Failed to transform ESLint module: ${path}`)
  }
  return {
    ...analysis,
    source: result.code
      .split('import.meta.url')
      .join(JSON.stringify(`file://${path}`)),
  }
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
  clearResolutionCaches()
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
      throw new Error('ESLint config exceeds the 64 MB module limit')
    }
    const {
      dependencies,
      source: transformed,
      usesLazyLoadingRuleMap,
      usesReaddirSync,
    } = transpile(path, source)
    modules[path] = transformed
    for (const { optional, specifier } of dependencies) {
      const resolved = await resolveModule(path, specifier)
      if (!resolved) {
        if (optional) {
          continue
        }
        throw new Error(`Cannot resolve module '${specifier}' from ${path}`)
      }
      resolutions[`${path}\0${specifier}`] = resolved
      if (!resolved.startsWith('node:')) {
        await visit(resolved)
      }
    }
    if (usesLazyLoadingRuleMap || usesReaddirSync) {
      await visitDirectory(dirname(path))
    }
  }

  const visitDirectory = async (directory: string): Promise<void> => {
    const entries = await FileSystem.readDirWithFileTypes(directory)
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory) {
        await visitDirectory(path)
      } else if (
        entry.isFile &&
        extensions.some((extension) => extension && path.endsWith(extension))
      ) {
        await visit(path)
      }
    }
  }

  await visit(entry, entrySource)
  const graph = { entry, modules, resolutions }
  cache.set(entry, { entrySource, graph })
  return graph
}
