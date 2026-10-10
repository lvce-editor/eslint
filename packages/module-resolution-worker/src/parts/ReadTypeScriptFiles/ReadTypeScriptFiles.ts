import * as FileSystem from '../FileSystem/FileSystem.ts'

export interface FileRequest {
  readonly kind: 'read' | 'stat' | 'directory'
  readonly path: string
}

// Deliberately do not cache contents here: the evaluator owns the selected files.
export const readTypeScriptFiles = async (
  requests: readonly FileRequest[],
): Promise<readonly any[]> => {
  if (requests.length > 10_000) {
    throw new Error('Too many TypeScript filesystem requests')
  }
  let bytes = 0
  return Promise.all(
    requests.map(async ({ kind, path }) => {
      let stat
      try {
        stat = await FileSystem.stat(path)
      } catch {
        return { kind, missing: true, path }
      }
      if (kind === 'directory' && stat.isDirectory) {
        return {
          entries: await FileSystem.readDirWithFileTypes(path),
          kind,
          path,
          ...stat,
        }
      }
      if (kind === 'read' && stat.isFile) {
        const content = await FileSystem.readFile(path)
        bytes += content.length
        if (bytes > 64 * 1024 * 1024) {
          throw new Error('TypeScript files exceed the 64 MB file limit')
        }
        return { content, kind, path, ...stat }
      }
      return { kind, path, ...stat }
    }),
  )
}
