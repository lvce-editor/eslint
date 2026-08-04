import type { FileChanges } from '@lvce-editor/api'
import { packages, transform } from '@babel/standalone'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import { configFileName } from '../FindEslintConfig/FindEslintConfig.ts'

export interface ModuleGraph {
  readonly entry: string
  readonly files: Readonly<Record<string, string>>
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
const virtualFileExtensions = [
  '.cjs',
  '.js',
  '.jsx',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]
const ignoredWorkspaceDirectories = new Set([
  '.git',
  '.tmp',
  'coverage',
  'dist',
  'node_modules',
])
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
  if (/^file:\/+/.test(uri)) {
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
  return fileName === configFileName
}

export const invalidateForFileChanges = (
  changes: Readonly<FileChanges>,
): boolean => {
  const changedPaths = getChangedPaths(changes)
  let shouldRefresh = changedPaths.some(isConfigFile)
  for (const [cacheKey, cached] of cache) {
    const hasChangedModule = changedPaths.some(
      (path) =>
        path === cached.graph.entry ||
        Object.hasOwn(cached.graph.modules, path),
    )
    if (!hasChangedModule) {
      continue
    }
    cache.delete(cacheKey)
    shouldRefresh = true
  }
  if (shouldRefresh) {
    clearResolutionCaches()
  }
  return shouldRefresh
}

const normalize = (path: string): string => {
  const normalizedSlashes = toPath(path).replaceAll('\\', '/')
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

const dirname = (path: string): string => {
  const normalized = normalize(path)
  const match = /^([a-z][a-z\d+.-]*:\/\/)/i.exec(normalized)
  const root = match ? `${match[1]}/` : '/'
  const index = normalized.lastIndexOf('/')
  return index < root.length ? root : normalized.slice(0, index)
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
  const candidates = extensions.map((extension) => `${candidate}${extension}`)
  const matches = await Promise.all(candidates.map(isFile))
  const index = matches.indexOf(true)
  return index === -1 ? undefined : normalize(candidates[index])
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
        (browserEntry || packageJson.main || packageJson.module))
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

const getAncestorDirectories = (parent: string): readonly string[] => {
  const directories: string[] = []
  let directory = dirname(parent)
  while (true) {
    directories.push(directory)
    const next = dirname(directory)
    if (next === directory) {
      return directories
    }
    directory = next
  }
}

const resolvePackage = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  const { packageName, subpath } = parsePackageSpecifier(specifier)
  const packageDirectories = getAncestorDirectories(parent).map((directory) =>
    join(directory, 'node_modules', packageName),
  )
  const matches = await Promise.all(packageDirectories.map(isDirectory))
  const index = matches.indexOf(true)
  if (index === -1) {
    return undefined
  }
  const packageDirectory = packageDirectories[index]
  if (subpath !== '.') {
    const packageJson = await readPackageJson(packageDirectory)
    const exportMap =
      typeof packageJson?.exports === 'object' ? packageJson.exports : undefined
    const exported = selectExport(exportMap?.[subpath])
    if (exported) {
      const resolvedExport = await resolveAsFileOrDirectory(
        join(packageDirectory, exported),
      )
      if (resolvedExport) {
        return resolvedExport
      }
    }
    return resolveAsFileOrDirectory(join(packageDirectory, subpath.slice(2)))
  }
  return resolveAsFileOrDirectory(packageDirectory)
}

const resolveBrowserReplacement = async (
  parent: string,
  specifier: string,
): Promise<string | undefined> => {
  const directories = getAncestorDirectories(parent)
  const packageManifests = await Promise.all(directories.map(readPackageJson))
  const index = packageManifests.findIndex(Boolean)
  if (index === -1) {
    return undefined
  }
  const browser = packageManifests[index]?.browser
  if (!browser || typeof browser === 'string') {
    return undefined
  }
  const replacement = browser[specifier]
  return typeof replacement === 'string'
    ? resolveAsFileOrDirectory(join(directories[index], replacement))
    : undefined
}

export const resolveModule = async (
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

const getCommonJsExportedValue = (statement: any): any => {
  const expression =
    statement.type === 'ExpressionStatement' ? statement.expression : undefined
  if (
    expression?.type !== 'AssignmentExpression' ||
    expression.left?.type !== 'MemberExpression'
  ) {
    return undefined
  }
  const { object } = expression.left
  const isModuleExports =
    object?.type === 'Identifier' &&
    object.name === 'module' &&
    expression.left.property?.type === 'Identifier' &&
    expression.left.property.name === 'exports'
  const isExportsProperty =
    object?.type === 'Identifier' && object.name === 'exports'
  const isModuleExportsProperty =
    object?.type === 'MemberExpression' &&
    object.object?.type === 'Identifier' &&
    object.object.name === 'module' &&
    object.property?.type === 'Identifier' &&
    object.property.name === 'exports'
  return isModuleExports || isExportsProperty || isModuleExportsProperty
    ? expression.right
    : undefined
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
    const exportedValue = getCommonJsExportedValue(statement)
    if (!exportedValue) {
      continue
    }
    const exportedFunction =
      exportedValue.type === 'Identifier'
        ? functions.get(exportedValue.name)
        : exportedValue
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

const getCommonJsSpecifiers = (source: string): readonly string[] => {
  const specifiers = new Set<string>()
  const requireCall = /\brequire(?:\.resolve)?\s*\(\s*["']([^"'\\]+)["']/g
  for (const match of source.matchAll(requireCall)) {
    specifiers.add(match[1])
  }
  return [...specifiers]
}

const transpile = (
  path: string,
  source: string,
  scanCommonJs: boolean,
): DependencyAnalysis & { source: string } => {
  if (path.endsWith('.json')) {
    return {
      dependencies: [],
      source,
      usesLazyLoadingRuleMap: false,
      usesReaddirSync: false,
    }
  }
  const hasModuleSyntax = source.split('\n').some((line) => {
    const trimmed = line.trimStart()
    return trimmed.startsWith('export ') || trimmed.startsWith('import ')
  })
  if (scanCommonJs && !path.endsWith('.mjs') && !hasModuleSyntax) {
    const lazyRuleMapIndex = source.indexOf('new LazyLoadingRuleMap')
    const dependencySource =
      lazyRuleMapIndex === -1 ? source : source.slice(0, lazyRuleMapIndex)
    return {
      dependencies: getCommonJsSpecifiers(dependencySource).map(
        (specifier) => ({
          optional: true,
          specifier,
        }),
      ),
      source,
      usesLazyLoadingRuleMap: lazyRuleMapIndex !== -1,
      usesReaddirSync: /\breaddirSync\s*\(/.test(source),
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

export const loadModule = async (
  modulePath: string,
  scanCommonJs = false,
): Promise<ModuleGraph> => {
  const entry = normalize(modulePath)
  const entrySource = await FileSystem.readFile(entry)
  const cacheKey = `${scanCommonJs ? 'commonjs' : 'module'}:${entry}`
  const cached = cache.get(cacheKey)
  if (cached?.entrySource === entrySource) {
    return cached.graph
  }
  clearResolutionCaches()
  const files: Record<string, string> = {}
  const modules: Record<string, string> = {}
  const resolutions: Record<string, string> = {}
  const preloadedDependencies: Array<{
    path: string
    specifier: string
  }> = []
  const pendingVisits = new Map<string, Promise<void>>()
  let totalBytes = 0

  const visitModule = async (
    path: string,
    knownSource?: string,
  ): Promise<void> => {
    if (Object.hasOwn(modules, path)) {
      return
    }
    if (Object.keys(modules).length >= maxModuleCount) {
      throw new Error(
        `ESLint config exceeds the ${maxModuleCount} module limit`,
      )
    }
    const source =
      knownSource ?? files[path] ?? (await FileSystem.readFile(path))
    totalBytes += source.length
    if (totalBytes > maxTotalBytes) {
      throw new Error('ESLint config exceeds the 64 MB module limit')
    }
    const {
      dependencies,
      source: transformed,
      usesLazyLoadingRuleMap,
      usesReaddirSync,
    } = transpile(path, source, scanCommonJs)
    delete files[path]
    modules[path] = transformed
    await Promise.all(
      dependencies.map(async ({ optional, specifier }) => {
        const resolved = await resolveModule(path, specifier)
        if (!resolved) {
          if (optional) {
            return
          }
          throw new Error(`Cannot resolve module '${specifier}' from ${path}`)
        }
        resolutions[`${path}\0${specifier}`] = resolved
        if (!resolved.startsWith('node:')) {
          await visit(resolved)
        }
      }),
    )
    if (usesLazyLoadingRuleMap || usesReaddirSync) {
      const directory = dirname(path)
      if (scanCommonJs) {
        await preloadVirtualFiles(directory, new Set())
      } else {
        await visitDirectory(directory)
      }
    }
  }

  const visit = (path: string, knownSource?: string): Promise<void> => {
    if (Object.hasOwn(modules, path)) {
      return Promise.resolve()
    }
    const pending = pendingVisits.get(path)
    if (pending) {
      return pending
    }
    const promise = visitModule(path, knownSource)
    pendingVisits.set(path, promise)
    return promise
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

  const preloadVirtualFiles = async (
    directory: string,
    ignoredDirectories: ReadonlySet<string>,
  ): Promise<void> => {
    const entries = await FileSystem.readDirWithFileTypes(directory)
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory) {
          if (!ignoredDirectories.has(entry.name)) {
            await preloadVirtualFiles(path, ignoredDirectories)
          }
          return
        }
        if (
          !entry.isFile ||
          virtualFileExtensions.every(
            (extension) => !path.endsWith(extension),
          ) ||
          Object.hasOwn(modules, path)
        ) {
          return
        }
        if (
          Object.keys(modules).length + Object.keys(files).length >=
          maxModuleCount
        ) {
          throw new Error(
            `ESLint config exceeds the ${maxModuleCount} file limit`,
          )
        }
        const source = await FileSystem.readFile(path)
        totalBytes += source.length
        if (totalBytes > maxTotalBytes) {
          throw new Error('ESLint config exceeds the 64 MB file limit')
        }
        files[path] = source
        if (scanCommonJs && !path.endsWith('.json')) {
          for (const specifier of getCommonJsSpecifiers(source)) {
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
              preloadedDependencies.push({ path, specifier })
            }
          }
        }
      }),
    )
  }

  await visit(entry, entrySource)
  await preloadVirtualFiles(dirname(entry), ignoredWorkspaceDirectories)
  for (const { path, specifier } of preloadedDependencies) {
    const resolved = await resolveModule(path, specifier)
    if (!resolved) {
      continue
    }
    resolutions[`${path}\0${specifier}`] = resolved
    if (!resolved.startsWith('node:')) {
      await visit(resolved)
    }
  }
  const typeScriptLibDirectories = new Set(
    Object.keys(modules)
      .filter((path) => path.includes('/node_modules/typescript/lib/'))
      .map(dirname),
  )
  for (const directory of typeScriptLibDirectories) {
    await preloadVirtualFiles(directory, new Set())
  }
  const graph = { entry, files, modules, resolutions }
  cache.set(cacheKey, { entrySource, graph })
  return graph
}

export const loadEslintConfig = loadModule
