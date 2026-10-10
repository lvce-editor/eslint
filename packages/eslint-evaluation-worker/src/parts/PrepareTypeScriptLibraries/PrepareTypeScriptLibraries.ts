import * as Path from '../Path/Path.ts'
import * as Rpc from '../Rpc/Rpc.ts'

type Request = {
  readonly path: string
  readonly kind: 'read' | 'stat' | 'directory'
}

type FileSystem = {
  readonly readFile: (path: string) => string | undefined
  readonly fileExists: (path: string) => boolean
  readonly directoryExists: (path: string) => boolean
  readonly entries: (path: string) => { files: string[]; directories: string[] }
  readonly addFile: (path: string, source: string) => void
  readonly addDirectory: (path: string, entries: readonly any[]) => void
}

export type ReadFiles = (
  requests: readonly Request[],
) => Promise<readonly any[]>

export const readFiles: ReadFiles = (requests) =>
  Rpc.invoke('ModuleResolution.readTypeScriptFiles', requests)

const getConfiguredProjects = (project: any): string[] => {
  if (typeof project === 'string') return [project]
  return Array.isArray(project) ? project : []
}

const getProjectPaths = (
  ts: any,
  parserOptions: any,
  filePath: string,
  root: string,
  host: any,
): Set<string> => {
  const paths = new Set<string>()
  const absolute = (path: string): string => {
    const normalized = path.replaceAll('\\', '/')
    return normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
      ? Path.normalize(normalized)
      : Path.join(root, normalized)
  }
  if (parserOptions.projectService || parserOptions.project === true) {
    const project = ts.findConfigFile(Path.dirname(filePath), host.fileExists)
    if (project) paths.add(project)
    else if (parserOptions.projectService)
      paths.add(
        absolute(
          parserOptions.projectService.defaultProject ?? 'tsconfig.json',
        ),
      )
  }
  if (parserOptions.projectService) {
    const service = parserOptions.projectService
    if (service.defaultProject || service.allowDefaultProject?.length) {
      paths.add(absolute(service.defaultProject ?? 'tsconfig.json'))
    }
    return paths
  }
  const configured = getConfiguredProjects(parserOptions.project)
  const excluded = [
    '**/node_modules/**',
    ...configured
      .filter((value) => value.startsWith('!'))
      .map((value) => value.slice(1)),
  ]
  const included = configured.filter((value) => !value.startsWith('!'))
  for (const value of included) {
    const matches = /[?*]/.test(value)
      ? host.readDirectory(root, ['.json'], excluded, [value])
      : [absolute(value)]
    for (const path of matches) paths.add(path)
  }
  return paths
}

const parseProjects = (
  ts: any,
  paths: Set<string>,
  host: any,
  projectService: any,
  filePath: string,
): any[] => {
  const visited = new Set<string>()
  const projects: any[] = []
  const visit = (path: string): void => {
    if (visited.has(path)) return
    visited.add(path)
    const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, host)
    if (!parsed) return
    projects.push(parsed)
    if (!projectService) return
    const references = parsed.projectReferences ?? []
    for (const reference of references)
      visit(ts.resolveProjectReferencePath(reference))
  }
  for (const path of paths) visit(path)
  if (projectService && projects.length === 0)
    projects.push({
      fileNames: [filePath],
      options: { target: ts.ScriptTarget.ESNext },
    })
  return projects
}

const probeProgram = (
  ts: any,
  project: any,
  host: any,
  compilerPath: string,
  text: string,
  filePath: string,
): void => {
  const compilerOptions = project.options
  const compilerHost = ts.createCompilerHost(compilerOptions)
  Object.assign(compilerHost, host, {
    getDefaultLibFileName: () =>
      Path.join(
        Path.dirname(compilerPath),
        ts.getDefaultLibFileName(compilerOptions),
      ),
    getDefaultLibLocation: () => Path.dirname(compilerPath),
    getDirectories: (path: string) => host.entries(path).directories,
    getSourceFile: (path: string, languageVersion: any) => {
      const source = path === filePath ? text : host.readFile(path)
      return source === undefined
        ? undefined
        : ts.createSourceFile(path, source, languageVersion)
    },
    realpath: (path: string) => path,
    useCaseSensitiveFileNames: () => true,
  })
  ts.createProgram(
    [...new Set([filePath, ...project.fileNames])],
    compilerOptions,
    compilerHost,
  )
}

const createHydration = (ts: any, fs: FileSystem, root: string) => {
  const completed = new Set<string>()
  const stats = new Map<string, { isFile: boolean; isDirectory: boolean }>()
  const staged = new Map<string, string>()
  let totalBytes = 0
  const requests = new Map<string, Request>()
  const used = new Set<string>()
  const request = (path: string, kind: Request['kind']): void => {
    const key = `${kind}\0${path}`
    if (!completed.has(key)) requests.set(key, { kind, path })
  }
  const entries = (path: string) => {
    request(path, 'directory')
    return fs.entries(path)
  }
  const host = {
    directoryExists: (path: string): boolean => {
      if (fs.directoryExists(path)) return true
      request(path, 'stat')
      return stats.get(path)?.isDirectory ?? false
    },
    entries,
    fileExists: (path: string): boolean => {
      if (staged.has(path) || fs.fileExists(path)) return true
      request(path, 'stat')
      return stats.get(path)?.isFile ?? false
    },
    getCurrentDirectory: () => root,
    onUnRecoverableConfigFileDiagnostic: () => {},
    readDirectory: (
      path: string,
      extensions: string[],
      excludes: string[],
      includes: string[],
      depth?: number,
    ): string[] =>
      ts.matchFiles(
        path,
        extensions,
        excludes,
        includes,
        true,
        root,
        depth,
        entries,
        (value: string) => value,
      ),
    readFile: (path: string): string | undefined => {
      const source = staged.get(path) ?? fs.readFile(path)
      if (source !== undefined) {
        used.add(path)
        return source
      }
      request(path, 'read')
      return undefined
    },
    useCaseSensitiveFileNames: true,
  }
  return {
    begin: () => {
      requests.clear()
      used.clear()
    },
    commit: () => {
      for (const path of used) {
        // Ambient/package declarations read by the probe are temporary. Loading
        // every dependency changes the parser's existing graph and retains its
        // ASTs. Project documents must survive for their reference-lib directives.
        if (
          path.includes('/node_modules/') &&
          !path.endsWith('.json') &&
          !/\/typescript\/lib\/lib[^/]*\.d\.ts$/.test(path) &&
          !path.includes('/node_modules/@typescript/lib-')
        )
          continue
        const source = staged.get(path)
        if (source !== undefined) fs.addFile(path, source)
      }
    },
    host,
    pending: () => requests.size > 0,
    read: async (load: ReadFiles): Promise<void> => {
      const results = await load(requests.values().toArray())
      for (const result of results) {
        completed.add(`${result.kind}\0${result.path}`)
        stats.set(result.path, {
          isDirectory: result.isDirectory ?? false,
          isFile: result.isFile ?? false,
        })
        if (typeof result.content === 'string') {
          totalBytes += result.content.length
          if (totalBytes > 64 * 1024 * 1024)
            throw new Error('TypeScript files exceed the 64 MB file limit')
          staged.set(result.path, result.content)
        }
        if (result.entries) fs.addDirectory(result.path, result.entries)
      }
    },
  }
}

// Discover files using the project's own compiler without touching the parser's
// caches. Each pass has a fresh Program. Probe-only package inputs are released.
export const prepareTypeScriptLibraries = async (
  ts: any,
  fs: FileSystem,
  compilerPath: string,
  text: string,
  filePath: string,
  baseDirectory: string,
  parserOptions: any,
  load: ReadFiles = readFiles,
): Promise<void> => {
  if (!parserOptions?.project && !parserOptions?.projectService) return
  if (parserOptions.programs?.length && !parserOptions.projectService) return
  const root = Path.normalize(parserOptions.tsconfigRootDir ?? baseDirectory)
  const documentPath = Path.normalize(filePath)
  const hydration = createHydration(ts, fs, root)
  for (let pass = 0; pass < 128; pass++) {
    hydration.begin()
    const paths = getProjectPaths(
      ts,
      parserOptions,
      documentPath,
      root,
      hydration.host,
    )
    const projects = parseProjects(
      ts,
      paths,
      hydration.host,
      parserOptions.projectService,
      documentPath,
    )
    if (!hydration.pending()) {
      for (const project of projects)
        probeProgram(
          ts,
          project,
          hydration.host,
          compilerPath,
          text,
          documentPath,
        )
    }
    if (!hydration.pending()) {
      hydration.commit()
      return
    }
    await hydration.read(load)
  }
  throw new Error('TypeScript filesystem preparation did not converge')
}
