import type { ReadFiles } from '../PrepareTypeScriptLibraries/PrepareTypeScriptLibraries.ts'
import * as PrepareTypeScriptLibraries from '../PrepareTypeScriptLibraries/PrepareTypeScriptLibraries.ts'

type Request = Parameters<ReadFiles>[0][number]

class TypeScriptProgramFilesPending extends Error {
  override readonly name = 'TypeScriptProgramFilesPending'
}

export const create = (
  addFile: (path: string, content: string) => void,
  addMetadata: (result: any) => void,
) => {
  const checked = new Set<string>()
  const requests = new Map<string, Request>()
  const staged = new Map<string, string>()
  const retained = new Set<string>()
  let evaluating = false
  let used: Set<string> | undefined
  let totalBytes = 0
  const request = (kind: Request['kind'], path: string): void => {
    const library =
      /\/typescript\/lib\/lib[^/]*\.d\.ts$/.test(path) ||
      path.includes('/node_modules/@typescript/lib-')
    if (!evaluating || (!used && !library)) return
    const key = `${kind}\0${path}`
    if (!checked.has(key)) requests.set(key, { kind, path })
  }
  const wrap = (compiler: any): any => {
    if (typeof compiler.createProgram !== 'function') return compiler
    const original = compiler.createProgram
    const createProgram = (...args: any[]): any => {
      if (!evaluating || used) return original(...args)
      used = new Set()
      let program
      try {
        program = original(...args)
        if (requests.size > 0) {
          throw new TypeScriptProgramFilesPending(
            'TypeScript Program needs virtual files',
          )
        }
        for (const path of used) retained.add(path)
      } finally {
        used = undefined
      }
      return program
    }
    const descriptors = Object.getOwnPropertyDescriptors(compiler)
    descriptors.createProgram = { enumerable: true, get: () => createProgram }
    return Object.defineProperties({}, descriptors)
  }
  const hydrate = async (): Promise<void> => {
    const results = await PrepareTypeScriptLibraries.readFiles(
      requests.values().toArray(),
    )
    requests.clear()
    for (const result of results) {
      checked.add(`${result.kind}\0${result.path}`)
      if (typeof result.content === 'string') {
        totalBytes += result.content.length
        if (totalBytes > 64 * 1024 * 1024)
          throw new Error('TypeScript files exceed the 64 MB file limit')
        staged.set(result.path, result.content)
      }
      addMetadata(result)
    }
  }
  const commit = (): void => {
    for (const path of retained) {
      const source = staged.get(path)
      if (source !== undefined) addFile(path, source)
    }
    for (const path of staged.keys()) {
      if (!retained.has(path)) checked.delete(`read\0${path}`)
    }
    staged.clear()
    retained.clear()
    totalBytes = 0
  }
  const ensureReady = (): void => {
    if (requests.size > 0)
      throw new TypeScriptProgramFilesPending(
        'TypeScript Program needs virtual files',
      )
  }
  const evaluate = async <T>(
    task: () => T,
    discard: () => void,
  ): Promise<T> => {
    for (let pass = 0; pass < 128; pass++) {
      evaluating = true
      try {
        const result = task()
        ensureReady()
        commit()
        return result
      } catch (error) {
        if (requests.size === 0 || !(error instanceof Error)) throw error
        discard()
      } finally {
        evaluating = false
      }
      await hydrate()
    }
    throw new Error('TypeScript Program file preparation did not converge')
  }
  return {
    evaluate,
    getFile: (path: string): string | undefined => staged.get(path),
    hasFile: (path: string): boolean => staged.has(path),
    read: (path: string): void => {
      if (used) used.add(path)
      else if (evaluating && staged.has(path)) retained.add(path)
    },
    request,
    wrap,
  }
}
