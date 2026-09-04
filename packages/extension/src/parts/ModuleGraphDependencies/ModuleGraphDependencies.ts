import type { FileChanges } from '@lvce-editor/api'
import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as Path from '../Path/Path.ts'

interface GraphDependencies {
  readonly paths: ReadonlySet<string>
  readonly root: string
}

const ignoredWorkspaceDirectories = new Set([
  '.git',
  '.tmp',
  'coverage',
  'dist',
  'node_modules',
])
const virtualFileExtensions = [
  '.cjs',
  '.js',
  '.jsx',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]
const graphDependencies = new Map<string, GraphDependencies>()

const toPath = (uri: string): string => {
  if (/^file:\/+/.test(uri)) {
    return decodeURIComponent(new URL(uri).pathname)
  }
  return uri
}

const normalize = (path: string): string => Path.normalize(toPath(path))

const getChangedPaths = (changes: Readonly<FileChanges>): readonly string[] => {
  return [
    ...(changes.changed ?? []),
    ...(changes.deleted ?? []),
    ...(changes.renamed ?? []).flat(),
  ].map(normalize)
}

const isVirtualWorkspaceFile = (path: string, root: string): boolean => {
  if (!path.startsWith(`${root}/`)) {
    return false
  }
  const relativePath = path.slice(root.length + 1)
  const pathParts = relativePath.split('/')
  return (
    pathParts.every((part) => !ignoredWorkspaceDirectories.has(part)) &&
    virtualFileExtensions.some((extension) => path.endsWith(extension))
  )
}

const record = (cacheKey: string, graph: ModuleGraph): void => {
  const paths = new Set([
    normalize(graph.entry),
    ...Object.keys(graph.files ?? {}).map(normalize),
    ...Object.keys(graph.lazyModules ?? {}).map(normalize),
    ...Object.keys(graph.modules).map(normalize),
  ])
  graphDependencies.set(cacheKey, {
    paths,
    root: Path.dirname(normalize(graph.entry)),
  })
}

export const clear = (): void => {
  graphDependencies.clear()
}

export const getAffectedCacheKeys = (
  changes: Readonly<FileChanges>,
): readonly string[] => {
  const changedPaths = getChangedPaths(changes)
  const affected: string[] = []
  for (const [cacheKey, dependencies] of graphDependencies) {
    if (
      changedPaths.some(
        (path) =>
          dependencies.paths.has(path) ||
          isVirtualWorkspaceFile(path, dependencies.root),
      )
    ) {
      affected.push(cacheKey)
    }
  }
  return affected
}

export const recordConfigGraph = (
  path: string,
  filePath: string | undefined,
  graph: ModuleGraph,
): void => {
  const entryUri = FileSystem.toUri(normalize(path))
  const fileUri = filePath ? FileSystem.toUri(normalize(filePath)) : ''
  record(`module:${entryUri}:${fileUri}`, graph)
}

export const recordEslintGraph = (
  path: string,
  projectPath: string | undefined,
  graph: ModuleGraph,
): void => {
  const entryUri = FileSystem.toUri(normalize(projectPath ?? path))
  record(`commonjs-project:${entryUri}`, graph)
}
