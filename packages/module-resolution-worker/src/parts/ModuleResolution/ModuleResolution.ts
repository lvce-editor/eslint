import { packages, transform } from '@babel/standalone'
import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as ModuleAnalysisCache from '../ModuleAnalysisCache/ModuleAnalysisCache.ts'
import * as ModuleGraphCache from '../ModuleGraphCache/ModuleGraphCache.ts'

export interface FileChanges {
  readonly changed?: readonly string[]
  readonly deleted?: readonly string[]
  readonly renamed?: readonly (readonly string[])[]
}

const configFileName = 'eslint.config.js'
const suppressionsFileName = 'eslint-suppressions.json'

export interface ModuleGraph {
  readonly entry: string
  readonly files: Readonly<Record<string, string>>
  readonly id: string
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}

interface ErrorDetails {
  readonly code?: string | number
  readonly message: string
  readonly name: string
  readonly stack?: string
}

interface ResolutionStats {
  readonly durationMs: number
  readonly fileReadCount: number
  readonly files: readonly FileSystem.FileRead[]
  readonly totalContentLength: number
  readonly uniqueFileCount: number
}

export interface ModuleResolutionTrace {
  readonly error?: ErrorDetails
  readonly graph?: ModuleGraph
  readonly stats: ResolutionStats
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
  'stream',
  'tty',
  'url',
  'util',
  'util/types',
  'vm',
  'worker_threads',
])
const extensions = ['', '.js', '.cjs', '.mjs', '.json', '.ts', '.tsx']
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
const directoryEntriesCache = new Map<
  string,
  Promise<Awaited<ReturnType<typeof FileSystem.readDirWithFileTypes>>>
>()

const toErrorDetails = (error: unknown): ErrorDetails => {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      name: 'Error',
    }
  }
  const { code } = error as Error & { readonly code?: unknown }
  return {
    ...((typeof code === 'string' || typeof code === 'number') && { code }),
    message: error.message,
    name: error.name,
    ...(error.stack && { stack: error.stack }),
  }
}

const captureResolution = async (
  task: () => Promise<ModuleGraph>,
): Promise<ModuleResolutionTrace> => {
  const capture = await FileSystem.captureFileReads(task)
  const files = capture.reads
  const stats = {
    durationMs: capture.durationMs,
    fileReadCount: files.length,
    files,
    totalContentLength: files.reduce(
      (total, file) => total + (file.contentLength ?? 0),
      0,
    ),
    uniqueFileCount: new Set(files.map((file) => file.path)).size,
  }
  return capture.error
    ? { error: toErrorDetails(capture.error), stats }
    : { graph: capture.result, stats }
}
const fileTypeCache = new Map<string, Promise<FileType>>()
const packageJsonCache = new Map<string, Promise<PackageJson | undefined>>()
const graphIdState = { next: 1 }

const clearResolutionCaches = (): void => {
  directoryEntriesCache.clear()
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
  return fileName === configFileName || fileName === suppressionsFileName
}

const isVirtualWorkspaceFile = (path: string, entry: string): boolean => {
  const workspaceDirectory = dirname(entry)
  if (!path.startsWith(`${workspaceDirectory}/`)) {
    return false
  }
  const relativePath = path.slice(workspaceDirectory.length + 1)
  const pathParts = relativePath.split('/')
  return (
    pathParts.every((part) => !ignoredWorkspaceDirectories.has(part)) &&
    virtualFileExtensions.some((extension) => path.endsWith(extension))
  )
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
        Object.hasOwn(cached.graph.modules, path) ||
        Object.hasOwn(cached.graph.files, path) ||
        isVirtualWorkspaceFile(path, cached.graph.entry),
    )
    if (!hasChangedModule) {
      continue
    }
    cache.delete(cacheKey)
    void ModuleGraphCache.remove(cacheKey)
    shouldRefresh = true
  }
  if (shouldRefresh) {
    clearResolutionCaches()
  }
  return shouldRefresh
}

export const invalidateCacheKeys = async (
  cacheKeys: readonly string[],
): Promise<void> => {
  for (const cacheKey of cacheKeys) {
    cache.delete(cacheKey)
  }
  clearResolutionCaches()
  await Promise.all(cacheKeys.map(ModuleGraphCache.remove))
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
  const windowsDriveRoot = /^\/[a-z]:/i.exec(normalized)?.[0]
  const root = match ? `${match[1]}/` : (windowsDriveRoot ?? '/')
  const index = normalized.lastIndexOf('/')
  return index < root.length ? root : normalized.slice(0, index)
}

const join = (...parts: readonly string[]): string => normalize(parts.join('/'))

const readDirectoryEntries = (
  directory: string,
): Promise<Awaited<ReturnType<typeof FileSystem.readDirWithFileTypes>>> => {
  const normalized = normalize(directory)
  const cached = directoryEntriesCache.get(normalized)
  if (cached) {
    return cached
  }
  const fileSystemPath = /^\/[a-z]:$/i.test(normalized)
    ? `${normalized}/`
    : normalized
  const entries = FileSystem.readDirWithFileTypes(fileSystemPath)
  directoryEntriesCache.set(normalized, entries)
  return entries
}

const getFileTypeFromParentEntries = async (
  path: string,
): Promise<FileType | undefined> => {
  const parent = dirname(path)
  if (parent === path) {
    await readDirectoryEntries(path)
    return 'directory'
  }
  const name = path.slice(path.lastIndexOf('/') + 1)
  const entries = await readDirectoryEntries(parent)
  const isWindowsPath = /^\/[a-z]:(?:\/|$)/i.test(path)
  const entry = entries.find(
    (candidate) =>
      candidate.name === name ||
      (isWindowsPath && candidate.name.toLowerCase() === name.toLowerCase()),
  )
  if (entry?.isFile) {
    return 'file'
  }
  if (entry?.isDirectory) {
    return 'directory'
  }
  return entry ? undefined : 'missing'
}

const getFileTypeFromAncestors = async (
  path: string,
  root?: string,
): Promise<FileType> => {
  if (root && path === root) {
    return 'directory'
  }
  if (/^\/[a-z]:$/i.test(path)) {
    return 'directory'
  }
  const parent = dirname(path)
  if (parent !== path && (await getFileType(parent, root)) !== 'directory') {
    return 'missing'
  }
  const fileType = await getFileTypeFromParentEntries(path)
  if (fileType === undefined) {
    return getFileTypeFromStat(path)
  }
  const name = path.slice(path.lastIndexOf('/') + 1)
  if (
    fileType === 'missing' &&
    /^\/[a-z]:\//i.test(path) &&
    /~\d/i.test(name)
  ) {
    return getFileTypeFromStat(path)
  }
  return fileType
}

const getFileTypeFromStat = async (path: string): Promise<FileType> => {
  try {
    const stat = await FileSystem.stat(path)
    if (stat.isFile) {
      return 'file'
    }
    return stat.isDirectory ? 'directory' : 'missing'
  } catch {
    try {
      return (await getFileTypeFromParentEntries(path)) ?? 'missing'
    } catch {
      return 'missing'
    }
  }
}

const getFileType = async (path: string, root?: string): Promise<FileType> => {
  const normalized = normalize(path)
  const normalizedRoot = root ? normalize(root) : undefined
  if (
    normalizedRoot &&
    normalized !== normalizedRoot &&
    !normalized.startsWith(`${normalizedRoot}/`)
  ) {
    return 'missing'
  }
  const cacheKey = `${normalizedRoot ?? ''}\0${normalized}`
  const cached = fileTypeCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const result = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)
    ? getFileTypeFromStat(normalized)
    : getFileTypeFromAncestors(normalized, normalizedRoot)
  fileTypeCache.set(cacheKey, result)
  return result
}

const isFile = async (path: string, root?: string): Promise<boolean> =>
  (await getFileType(path, root)) === 'file'

const isDirectory = async (path: string, root?: string): Promise<boolean> =>
  (await getFileType(path, root)) === 'directory'

const isWithinDirectory = (directory: string, path: string): boolean =>
  path === directory || path.startsWith(`${directory}/`)

const findTypeScriptProjectDirectory = async (
  workspaceDirectory: string,
  filePath: string,
): Promise<string> => {
  let directory = dirname(normalize(filePath))
  while (isWithinDirectory(workspaceDirectory, directory)) {
    if (await isFile(join(directory, 'tsconfig.json'), workspaceDirectory)) {
      return directory
    }
    if (directory === workspaceDirectory) {
      break
    }
    directory = dirname(directory)
  }
  return dirname(normalize(filePath))
}

type TypeScriptConfigPaths = {
  readonly extendsPaths: readonly string[]
  readonly filePaths: readonly string[]
  readonly referencePaths: readonly string[]
}

const getObjectProperty = (object: any, name: string): any => {
  if (object?.type !== 'ObjectExpression') {
    return undefined
  }
  return object.properties.find(
    (property: any) =>
      property.type === 'ObjectProperty' &&
      ((property.key.type === 'Identifier' && property.key.name === name) ||
        (property.key.type === 'StringLiteral' && property.key.value === name)),
  )?.value
}

const getStringValues = (value: any): readonly string[] => {
  if (value?.type === 'StringLiteral') {
    return [value.value]
  }
  if (value?.type !== 'ArrayExpression') {
    return []
  }
  return value.elements
    .filter((element: any) => element?.type === 'StringLiteral')
    .map((element: any) => element.value)
}

const getTypeScriptConfigPaths = (source: string): TypeScriptConfigPaths => {
  try {
    const config = packages.parser.parseExpression(`(${source})`)
    const references = getObjectProperty(config, 'references')
    const referencePaths =
      references?.type === 'ArrayExpression'
        ? references.elements.flatMap((reference: any) =>
            getStringValues(getObjectProperty(reference, 'path')),
          )
        : []
    return {
      extendsPaths: getStringValues(getObjectProperty(config, 'extends')),
      filePaths: [
        ...getStringValues(getObjectProperty(config, 'files')),
        ...getStringValues(getObjectProperty(config, 'include')),
      ],
      referencePaths,
    }
  } catch {
    return { extendsPaths: [], filePaths: [], referencePaths: [] }
  }
}

const readPackageJson = async (
  directory: string,
  root?: string,
): Promise<PackageJson | undefined> => {
  const normalized = normalize(directory)
  const normalizedRoot = root ? normalize(root) : ''
  const cacheKey = `${normalizedRoot}\0${normalized}`
  const cached = packageJsonCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const result = (async (): Promise<PackageJson | undefined> => {
    const path = join(normalized, 'package.json')
    if (!(await isFile(path, root))) {
      return undefined
    }
    const content = await FileSystem.readFile(path)
    return JSON.parse(content)
  })()
  packageJsonCache.set(cacheKey, result)
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
  root?: string,
): Promise<string | undefined> => {
  const candidates = extensions.map((extension) => `${candidate}${extension}`)
  const matches = await Promise.all(
    candidates.map((candidate) => isFile(candidate, root)),
  )
  const index = matches.indexOf(true)
  return index === -1 ? undefined : normalize(candidates[index])
}

const resolveAsFileOrDirectory = async (
  candidate: string,
  packageSubpath = '.',
  root?: string,
): Promise<string | undefined> => {
  const file = await resolveAsFile(candidate, root)
  if (file) {
    return file
  }
  if (!(await isDirectory(candidate, root))) {
    return undefined
  }
  const packageJson = await readPackageJson(candidate, root)
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
        '.',
        root,
      )
      if (resolvedEntry) {
        return resolvedEntry
      }
    }
  }
  return resolveAsFile(join(candidate, 'index'), root)
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

const getAncestorDirectories = (
  parent: string,
  root?: string,
): readonly string[] => {
  const directories: string[] = []
  const normalizedRoot = root ? normalize(root) : undefined
  let directory = dirname(parent)
  while (true) {
    if (normalizedRoot && !isWithinDirectory(normalizedRoot, directory)) {
      return directories
    }
    directories.push(directory)
    if (directory === normalizedRoot) {
      return directories
    }
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
  root?: string,
): Promise<string | undefined> => {
  const { packageName, subpath } = parsePackageSpecifier(specifier)
  const packageDirectories = getAncestorDirectories(parent, root).map(
    (directory) => join(directory, 'node_modules', packageName),
  )
  const matches = await Promise.all(
    packageDirectories.map((directory) => isDirectory(directory, root)),
  )
  const index = matches.indexOf(true)
  if (index === -1) {
    return undefined
  }
  const packageDirectory = packageDirectories[index]
  if (subpath !== '.') {
    const packageJson = await readPackageJson(packageDirectory, root)
    const exportMap =
      typeof packageJson?.exports === 'object' ? packageJson.exports : undefined
    const exported = selectExport(exportMap?.[subpath])
    if (exported) {
      const resolvedExport = await resolveAsFileOrDirectory(
        join(packageDirectory, exported),
        '.',
        root,
      )
      if (resolvedExport) {
        return resolvedExport
      }
    }
    return resolveAsFileOrDirectory(
      join(packageDirectory, subpath.slice(2)),
      '.',
      root,
    )
  }
  return resolveAsFileOrDirectory(packageDirectory, '.', root)
}

const resolveBrowserReplacement = async (
  parent: string,
  specifier: string,
  root?: string,
): Promise<string | undefined> => {
  const directories = getAncestorDirectories(parent, root)
  const packageManifests = await Promise.all(
    directories.map((directory) => readPackageJson(directory, root)),
  )
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
    ? resolveAsFileOrDirectory(join(directories[index], replacement), '.', root)
    : undefined
}

const resolveModule = async (
  parent: string,
  specifier: string,
  root?: string,
): Promise<string | undefined> => {
  const effectiveRoot =
    root && isWithinDirectory(root, normalize(parent)) ? root : undefined
  const browserReplacement = await resolveBrowserReplacement(
    parent,
    specifier,
    effectiveRoot,
  )
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
    const candidateRoot =
      effectiveRoot && isWithinDirectory(effectiveRoot, normalize(candidate))
        ? effectiveRoot
        : undefined
    return resolveAsFileOrDirectory(candidate, '.', candidateRoot)
  }
  return resolvePackage(parent, specifier, effectiveRoot)
}

type Dependency = {
  readonly optional: boolean
  readonly specifier: string
}

type DependencyAnalysis = {
  readonly dependencies: readonly Dependency[]
  readonly fileSpecifiers: readonly string[]
  readonly usesGlobSync: boolean
  readonly usesLazyLoadingRuleMap: boolean
  readonly usesReaddirSync: boolean
}

type PortableModuleAnalysis = DependencyAnalysis & {
  readonly source: string
  readonly substituteImportMeta: boolean
}

const isDependency = (value: unknown): value is Dependency => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<Dependency>
  return (
    typeof candidate.optional === 'boolean' &&
    typeof candidate.specifier === 'string'
  )
}

const isDependencyAnalysis = (value: unknown): value is DependencyAnalysis => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<DependencyAnalysis>
  return (
    Array.isArray(candidate.dependencies) &&
    candidate.dependencies.every(isDependency) &&
    Array.isArray(candidate.fileSpecifiers) &&
    candidate.fileSpecifiers.every(
      (specifier) => typeof specifier === 'string',
    ) &&
    typeof candidate.usesGlobSync === 'boolean' &&
    typeof candidate.usesLazyLoadingRuleMap === 'boolean' &&
    typeof candidate.usesReaddirSync === 'boolean'
  )
}

const isPortableModuleAnalysis = (
  value: unknown,
): value is PortableModuleAnalysis => {
  if (!isDependencyAnalysis(value)) {
    return false
  }
  const candidate = value as Partial<PortableModuleAnalysis>
  return (
    typeof candidate.source === 'string' &&
    typeof candidate.substituteImportMeta === 'boolean'
  )
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

const preserveCommonJsDefaultImport = (): any => ({
  visitor: {
    FunctionDeclaration(path: any): void {
      const { node } = path
      if (!/^_interopRequireDefault\d*$/.test(node.id?.name ?? '')) {
        return
      }
      const [parameter] = node.params
      const [statement] = node.body.body
      const conditional =
        statement?.type === 'ReturnStatement' ? statement.argument : undefined
      if (
        parameter?.type !== 'Identifier' ||
        conditional?.type !== 'ConditionalExpression'
      ) {
        return
      }
      const hasDefault = packages.types.binaryExpression(
        'in',
        packages.types.stringLiteral('default'),
        packages.types.identifier(parameter.name),
      )
      conditional.test = packages.types.logicalExpression(
        '&&',
        conditional.test,
        hasDefault,
      )
    },
  },
})

/* eslint-disable sonarjs/cognitive-complexity */
const getDependencies = (
  ast: unknown,
  includeTypeOnlyImports = false,
): DependencyAnalysis => {
  const dependencies = new Map<string, boolean>()
  const fileSpecifiers = new Set<string>()
  const seen = new WeakSet<object>()
  let usesGlobSync = false
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
      directCallee?.type === 'MemberExpression' &&
      directCallee.object?.type === 'Identifier' &&
      directCallee.object.name === 'glob' &&
      directCallee.property?.type === 'Identifier' &&
      directCallee.property.name === 'sync'
    ) {
      usesGlobSync = true
    }
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
      directCallee?.type === 'MemberExpression' &&
      directCallee.property?.type === 'Identifier' &&
      directCallee.property.name === 'readFileSync'
    ) {
      const argument = value.arguments?.[0]
      if (argument?.type === 'StringLiteral') {
        fileSpecifiers.add(argument.value)
      } else if (
        argument?.type === 'CallExpression' &&
        argument.callee?.type === 'MemberExpression' &&
        argument.callee.property?.type === 'Identifier' &&
        ['join', 'resolve'].includes(argument.callee.property.name)
      ) {
        const parts = argument.arguments
          .filter((part: any) => part.type === 'StringLiteral')
          .map((part: any) => part.value)
        const hasModuleDirectory = argument.arguments.some(
          (part: any) =>
            (part.type === 'Identifier' && part.name === '__dirname') ||
            (part.type === 'MemberExpression' &&
              part.object?.type === 'MetaProperty' &&
              part.object.meta?.name === 'import' &&
              part.object.property?.name === 'meta' &&
              part.property?.type === 'Identifier' &&
              part.property.name === 'dirname'),
        )
        if (hasModuleDirectory && parts.length > 0) {
          fileSpecifiers.add(parts.join('/'))
        }
      }
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
    const isTypeOnlyImport =
      value.importKind === 'type' ||
      value.importKind === 'typeof' ||
      value.exportKind === 'type' ||
      (value.type === 'ImportDeclaration' &&
        value.specifiers?.length > 0 &&
        value.specifiers.every(
          (specifier: any) =>
            specifier.importKind === 'type' ||
            specifier.importKind === 'typeof',
        ))
    if (
      importTypes.includes(value.type) &&
      (!isTypeOnlyImport || includeTypeOnlyImports) &&
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
    fileSpecifiers: [...fileSpecifiers],
    usesGlobSync,
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

const transformDynamicModuleLoading = ({ types }: any) => ({
  visitor: {
    AwaitExpression: {
      exit(path: any): void {
        const { argument } = path.node
        if (
          argument?.type === 'ImportExpression' ||
          (argument?.type === 'CallExpression' &&
            argument.callee?.type === 'Import')
        ) {
          const arguments_ =
            argument.type === 'ImportExpression'
              ? [argument.source]
              : argument.arguments
          path.replaceWith(
            types.callExpression(types.identifier('require'), arguments_),
          )
          return
        }
        const isTopLevelPromiseAll =
          path.parentPath?.isExpressionStatement() &&
          argument?.type === 'CallExpression' &&
          argument.callee?.type === 'MemberExpression' &&
          argument.callee.object?.type === 'Identifier' &&
          argument.callee.object.name === 'Promise' &&
          argument.callee.property?.type === 'Identifier' &&
          argument.callee.property.name === 'all'
        if (isTopLevelPromiseAll) {
          path.replaceWith(argument)
        }
      },
    },
  },
})

const getFileExtension = (path: string): string => {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex === -1 ? '' : fileName.slice(extensionIndex)
}

const getAnalysisCacheKey = async (
  kind: string,
  path: string,
  source: string,
): Promise<string | undefined> => {
  try {
    const hash = await ComputeTextHash.computeTextHash(source)
    return `${kind}:${getFileExtension(path)}:${hash}`
  } catch {
    return undefined
  }
}

const substituteImportMeta = (path: string, source: string): string => {
  return source
    .split('import.meta.dirname')
    .join(JSON.stringify(dirname(path)))
    .split('import.meta.filename')
    .join(JSON.stringify(path))
    .split('import.meta.url')
    .join(JSON.stringify(`file://${path}`))
}

const transpileUncached = (
  path: string,
  source: string,
  scanCommonJs: boolean,
): PortableModuleAnalysis => {
  if (path.endsWith('.json')) {
    return {
      dependencies: [],
      fileSpecifiers: [],
      source,
      substituteImportMeta: false,
      usesGlobSync: false,
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
      fileSpecifiers: [],
      source,
      substituteImportMeta: false,
      usesGlobSync: false,
      usesLazyLoadingRuleMap: lazyRuleMapIndex !== -1,
      usesReaddirSync: /\breaddirSync\s*\(/.test(source),
    }
  }
  const isTypeScript = path.endsWith('.ts') || path.endsWith('.tsx')
  const isTsx = path.endsWith('.tsx')
  const parserPlugins: any[] = isTypeScript
    ? [['typescript', { isTSX: isTsx }]]
    : []
  const ast = packages.parser.parse(source, {
    plugins: parserPlugins,
    sourceType: 'unambiguous',
  })
  const analysis = getDependencies(ast)
  if (ast.program.sourceType !== 'module') {
    return { ...analysis, source, substituteImportMeta: false }
  }
  const extension = getFileExtension(path)
  const result = transform(source, {
    babelrc: false,
    comments: false,
    configFile: false,
    filename: `module${extension || '.js'}`,
    plugins: [
      ...(isTypeScript
        ? ([
            ['transform-typescript', { allExtensions: true, isTSX: isTsx }],
          ] as const)
        : []),
      transformDynamicModuleLoading,
      'transform-modules-commonjs',
      preserveCommonJsDefaultImport,
    ],
    sourceMaps: false,
    sourceType: 'unambiguous',
  })
  if (!result.code) {
    throw new Error(`Failed to transform ESLint module: ${path}`)
  }
  return {
    ...analysis,
    source: result.code,
    substituteImportMeta: true,
  }
}

const transpile = async (
  path: string,
  source: string,
  scanCommonJs: boolean,
): Promise<DependencyAnalysis & { source: string }> => {
  const kind = scanCommonJs ? 'commonjs' : 'module'
  const cacheKey = await getAnalysisCacheKey(kind, path, source)
  const portable = cacheKey
    ? await ModuleAnalysisCache.getOrCompute(
        cacheKey,
        isPortableModuleAnalysis,
        () => transpileUncached(path, source, scanCommonJs),
      )
    : transpileUncached(path, source, scanCommonJs)
  const { substituteImportMeta: shouldSubstituteImportMeta, ...analysis } =
    portable
  return {
    ...analysis,
    source: shouldSubstituteImportMeta
      ? substituteImportMeta(path, portable.source)
      : portable.source,
  }
}

const analyzeDocumentDependencies = async (
  path: string,
  source: string,
): Promise<DependencyAnalysis> => {
  const cacheKey = await getAnalysisCacheKey('document', path, source)
  const compute = (): DependencyAnalysis => {
    const isTypeScript = ['.cts', '.mts', '.ts', '.tsx'].some((extension) =>
      path.endsWith(extension),
    )
    const parserPlugins: any[] = isTypeScript
      ? [['typescript', { isTSX: path.endsWith('.tsx') }]]
      : []
    const ast = packages.parser.parse(source, {
      plugins: parserPlugins,
      sourceType: 'unambiguous',
    })
    return getDependencies(ast, true)
  }
  if (!cacheKey) {
    return compute()
  }
  return ModuleAnalysisCache.getOrCompute(
    cacheKey,
    isDependencyAnalysis,
    compute,
  )
}

const restoreModuleGraph = async (
  cacheKey: string,
  expectedEntry?: string,
): Promise<ModuleGraph | undefined> => {
  const restored = await ModuleGraphCache.restore(cacheKey)
  if (
    !restored ||
    (expectedEntry && normalize(restored.entry) !== expectedEntry)
  ) {
    return undefined
  }
  try {
    const graph = {
      entry: restored.entry,
      files: restored.files,
      id: `${cacheKey}:${graphIdState.next++}`,
      modules: restored.modules,
      resolutions: restored.resolutions,
    }
    cache.set(cacheKey, {
      entrySource: restored.entrySource,
      graph,
    })
    return graph
  } catch {
    return undefined
  }
}

/* eslint-disable sonarjs/cognitive-complexity */
const loadModule = async (
  modulePath: string,
  scanCommonJs = false,
  virtualFilePath?: string,
  cacheKeyOverride?: string,
  shouldRestore = true,
  resolutionRoot?: string,
  bypassCache = false,
): Promise<ModuleGraph> => {
  const entry = normalize(modulePath)
  const cacheKey =
    cacheKeyOverride ??
    `${scanCommonJs ? 'commonjs' : 'module'}:${FileSystem.toUri(entry)}:${virtualFilePath ? FileSystem.toUri(normalize(virtualFilePath)) : ''}`
  const cached = bypassCache ? undefined : cache.get(cacheKey)
  if (cached) {
    const entrySource = await FileSystem.readFile(cached.graph.entry)
    if (cached.entrySource === entrySource) {
      return cached.graph
    }
  }
  if (shouldRestore && !bypassCache) {
    const restored = await restoreModuleGraph(cacheKey, entry)
    if (restored) {
      return restored
    }
  }
  const entrySource = await FileSystem.readFile(entry)
  clearResolutionCaches()
  const files: Record<string, string> = {}
  const modules: Record<string, string> = {}
  const moduleSources: Record<string, string> = {}
  const resolutions: Record<string, string> = {}
  const preloadedDependencies: Array<{
    path: string
    specifier: string
  }> = []
  const pendingVisits = new Map<string, Promise<void>>()
  let totalBytes = 0
  const getResolutionRoot = (path: string): string | undefined =>
    resolutionRoot && isWithinDirectory(resolutionRoot, normalize(path))
      ? resolutionRoot
      : undefined

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
      fileSpecifiers,
      source: transformed,
      usesGlobSync,
      usesLazyLoadingRuleMap,
      usesReaddirSync,
    } = await transpile(path, source, scanCommonJs)
    delete files[path]
    moduleSources[path] = source
    modules[path] = transformed
    for (const specifier of fileSpecifiers) {
      const filePath = specifier.startsWith('/')
        ? normalize(specifier)
        : join(dirname(path), specifier)
      if (
        Object.hasOwn(modules, filePath) ||
        Object.hasOwn(files, filePath) ||
        !(await isFile(filePath, getResolutionRoot(filePath)))
      ) {
        continue
      }
      const content = await FileSystem.readFile(filePath)
      totalBytes += content.length
      if (totalBytes > maxTotalBytes) {
        throw new Error('ESLint config exceeds the 64 MB file limit')
      }
      files[filePath] = content
    }
    await Promise.all(
      dependencies.map(async ({ optional, specifier }) => {
        const resolved = await resolveModule(
          path,
          specifier,
          getResolutionRoot(path),
        )
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
    if (usesGlobSync || usesLazyLoadingRuleMap || usesReaddirSync) {
      const directory = dirname(path)
      if (scanCommonJs) {
        await preloadVirtualFiles(directory, new Set())
      } else if (usesGlobSync) {
        await visitDirectoryFiles(directory)
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
        !path.endsWith('.d.ts') &&
        extensions.some((extension) => extension && path.endsWith(extension))
      ) {
        await visit(path)
      }
    }
  }

  const visitDirectoryFiles = async (directory: string): Promise<void> => {
    const entries = await FileSystem.readDirWithFileTypes(directory)
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (
        entry.isFile &&
        !path.endsWith('.d.ts') &&
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

  const preloadFile = async (path: string): Promise<void> => {
    if (
      Object.hasOwn(modules, path) ||
      Object.hasOwn(files, path) ||
      !(await isFile(path, getResolutionRoot(path)))
    ) {
      return
    }
    const source = await FileSystem.readFile(path)
    totalBytes += source.length
    if (totalBytes > maxTotalBytes) {
      throw new Error('ESLint config exceeds the 64 MB file limit')
    }
    files[path] = source
  }

  const preloadDocumentDependencies = async (path: string): Promise<void> => {
    const source = files[path]
    const isJavaScriptLike = [
      '.cjs',
      '.cts',
      '.js',
      '.jsx',
      '.mjs',
      '.mts',
      '.ts',
      '.tsx',
    ].some((extension) => path.endsWith(extension))
    if (!source || !isJavaScriptLike) {
      return
    }
    const { dependencies } = await analyzeDocumentDependencies(path, source)
    for (const { specifier } of dependencies) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        continue
      }
      const resolved = await resolveModule(
        path,
        specifier,
        getResolutionRoot(path),
      )
      if (resolved && !resolved.startsWith('node:')) {
        await preloadFile(resolved)
      }
    }
  }

  const resolveTypeScriptConfigPath = async (
    directory: string,
    specifier: string,
  ): Promise<string | undefined> => {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return undefined
    }
    const candidate = specifier.startsWith('/')
      ? normalize(specifier)
      : join(directory, specifier)
    const candidateRoot = getResolutionRoot(candidate)
    if (await isFile(candidate, candidateRoot)) {
      return candidate
    }
    if (await isDirectory(candidate, candidateRoot)) {
      const index = join(candidate, 'tsconfig.json')
      return (await isFile(index, candidateRoot)) ? index : undefined
    }
    const jsonCandidate = `${candidate}.json`
    return (await isFile(jsonCandidate, getResolutionRoot(jsonCandidate)))
      ? jsonCandidate
      : undefined
  }

  const preloadedTypeScriptConfigs = new Set<string>()
  const preloadTypeScriptConfig = async (
    configPath: string,
    projectDirectory: string,
  ): Promise<void> => {
    if (preloadedTypeScriptConfigs.has(configPath)) {
      return
    }
    preloadedTypeScriptConfigs.add(configPath)
    await preloadFile(configPath)
    const source = files[configPath]
    if (!source) {
      return
    }
    const configDirectory = dirname(configPath)
    const { extendsPaths, filePaths, referencePaths } =
      getTypeScriptConfigPaths(source)
    for (const specifier of extendsPaths) {
      const extendedConfig = await resolveTypeScriptConfigPath(
        configDirectory,
        specifier,
      )
      if (extendedConfig) {
        await preloadTypeScriptConfig(extendedConfig, projectDirectory)
      }
    }
    for (const specifier of referencePaths) {
      const referencedConfig = await resolveTypeScriptConfigPath(
        configDirectory,
        specifier,
      )
      if (referencedConfig) {
        await preloadTypeScriptConfig(
          referencedConfig,
          dirname(referencedConfig),
        )
      }
    }
    for (const specifier of filePaths) {
      const path = join(configDirectory, specifier)
      const wildcardIndex = path.search(/[?*[\]{}]/)
      if (wildcardIndex === -1) {
        if (await isDirectory(path, getResolutionRoot(path))) {
          if (!isWithinDirectory(projectDirectory, path)) {
            await preloadVirtualFiles(path, ignoredWorkspaceDirectories)
          }
        } else {
          await preloadFile(path)
        }
        continue
      }
      const prefix = path.slice(0, wildcardIndex)
      const directory = prefix.endsWith('/')
        ? prefix.slice(0, -1)
        : dirname(prefix)
      if (
        directory &&
        !isWithinDirectory(projectDirectory, directory) &&
        (await isDirectory(directory, getResolutionRoot(directory)))
      ) {
        await preloadVirtualFiles(directory, ignoredWorkspaceDirectories)
      }
    }
  }

  await visit(entry, entrySource)
  const workspaceDirectory = dirname(entry)
  const virtualFileDirectory = virtualFilePath
    ? await findTypeScriptProjectDirectory(workspaceDirectory, virtualFilePath)
    : workspaceDirectory
  if (virtualFilePath) {
    const normalizedVirtualFilePath = normalize(virtualFilePath)
    await preloadFile(normalizedVirtualFilePath)
    await preloadDocumentDependencies(normalizedVirtualFilePath)
  } else {
    await preloadVirtualFiles(virtualFileDirectory, ignoredWorkspaceDirectories)
  }
  const typeScriptConfigPath = join(virtualFileDirectory, 'tsconfig.json')
  if (await isFile(typeScriptConfigPath, resolutionRoot)) {
    await preloadTypeScriptConfig(typeScriptConfigPath, virtualFileDirectory)
  }
  for (const { path, specifier } of preloadedDependencies) {
    const resolved = await resolveModule(path, specifier, resolutionRoot)
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
  const packageDirectories = new Set<string>()
  for (const path of Object.keys(modules)) {
    const marker = '/node_modules/'
    const markerIndex = path.lastIndexOf(marker)
    if (markerIndex === -1) {
      continue
    }
    const packagePath = path.slice(markerIndex + marker.length)
    const parts = packagePath.split('/')
    const packagePartCount = packagePath.startsWith('@') ? 2 : 1
    packageDirectories.add(
      `${path.slice(0, markerIndex + marker.length)}${parts
        .slice(0, packagePartCount)
        .join('/')}`,
    )
  }
  for (const directory of packageDirectories) {
    const manifestPath = join(directory, 'package.json')
    if (
      Object.hasOwn(modules, manifestPath) ||
      Object.hasOwn(files, manifestPath) ||
      !(await isFile(manifestPath, getResolutionRoot(manifestPath)))
    ) {
      continue
    }
    const source = await FileSystem.readFile(manifestPath)
    totalBytes += source.length
    if (totalBytes > maxTotalBytes) {
      throw new Error('ESLint config exceeds the 64 MB file limit')
    }
    files[manifestPath] = source
  }
  const graph = {
    entry,
    files,
    id: `${cacheKey}:${graphIdState.next++}`,
    modules,
    resolutions,
  }
  if (!bypassCache) {
    cache.set(cacheKey, { entrySource, graph })
    await ModuleGraphCache.save(cacheKey, {
      entry,
      files,
      modules,
      moduleSources,
      resolutions,
    })
  }
  return graph
}
/* eslint-enable sonarjs/cognitive-complexity */

export function loadEslintConfig(
  modulePath: string,
  filePath: string | undefined,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintConfig(
  modulePath: string,
  filePath?: string,
  captureStats?: false,
): Promise<ModuleGraph>
export function loadEslintConfig(
  modulePath: string,
  filePath?: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  const load = (): Promise<ModuleGraph> =>
    loadModule(
      modulePath,
      false,
      filePath,
      undefined,
      true,
      dirname(modulePath),
      captureStats,
    )
  return captureStats ? captureResolution(load) : load()
}

const loadEslintModuleGraph = async (
  filePath: string,
  projectPath?: string,
  bypassCache = false,
): Promise<ModuleGraph> => {
  const resolutionRoot = projectPath
    ? dirname(normalize(projectPath))
    : undefined
  const cacheKey = `commonjs-project:${FileSystem.toUri(normalize(projectPath ?? filePath))}`
  const cached = bypassCache ? undefined : cache.get(cacheKey)
  if (cached) {
    const entrySource = await FileSystem.readFile(cached.graph.entry)
    if (cached.entrySource === entrySource) {
      return cached.graph
    }
  }
  if (!bypassCache) {
    const restored = await restoreModuleGraph(cacheKey)
    if (restored) {
      return restored
    }
  }
  const entry = await resolveModule(filePath, 'eslint', resolutionRoot)
  if (!entry) {
    throw new Error(
      `Cannot find ESLint in project node_modules for ${filePath}`,
    )
  }
  return loadModule(
    entry,
    true,
    undefined,
    cacheKey,
    false,
    resolutionRoot,
    bypassCache,
  )
}

export function loadEslintModule(
  filePath: string,
  projectPath: string | undefined,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintModule(
  filePath: string,
  projectPath?: string,
  captureStats?: false,
): Promise<ModuleGraph>
export function loadEslintModule(
  filePath: string,
  projectPath?: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  const load = (): Promise<ModuleGraph> =>
    loadEslintModuleGraph(filePath, projectPath, captureStats)
  return captureStats ? captureResolution(load) : load()
}
