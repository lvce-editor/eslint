/// <reference types="node" />
import { expect, test } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as ts from 'typescript'
import { prepareTypeScriptLibraries } from '../src/parts/PrepareTypeScriptLibraries/PrepareTypeScriptLibraries.ts'

const libraryDirectory = dirname(
  createRequire(import.meta.url).resolve('typescript'),
)
const compilerPath = '/workspace/node_modules/typescript/lib/typescript.js'
const libraryPrefix = '/workspace/node_modules/typescript/lib/'

const prepare = async (
  options: any,
  configs: Record<string, string> = {},
  text = 'const value = 1',
) => {
  const available: Record<string, string> = {
    '/workspace/file.ts': text,
    ...configs,
  }
  for (const name of readdirSync(libraryDirectory)) {
    if (/^lib.*\.d\.ts$/.test(name))
      available[`${libraryPrefix}${name}`] = readFileSync(
        join(libraryDirectory, name),
        'utf8',
      )
  }
  const files: Record<string, string> = { '/workspace/file.ts': text }
  const directories = new Map<string, readonly any[]>()
  const requests: any[] = []
  const exists = (path: string) =>
    Object.keys(available).some((file) =>
      file.startsWith(`${path.replace(/\/$/, '')}/`),
    )
  await prepareTypeScriptLibraries(
    ts,
    {
      addDirectory: (path, entries) => {
        directories.set(path, entries)
      },
      addFile: (path, source) => {
        files[path] = source
      },
      directoryExists: exists,
      entries: (path) => {
        const entries = directories.get(path) ?? []
        return {
          directories: entries
            .filter((entry) => entry.isDirectory)
            .map((entry) => entry.name),
          files: entries
            .filter((entry) => entry.isFile)
            .map((entry) => entry.name),
        }
      },
      fileExists: (path) => Object.hasOwn(files, path),
      readFile: (path) => files[path],
    },
    compilerPath,
    text,
    '/workspace/file.ts',
    '/workspace',
    options,
    async (batch) => {
      requests.push(...batch)
      return batch.map(({ kind, path }) => {
        const isFile = Object.hasOwn(available, path)
        const isDirectory = exists(path)
        const entries = new Map<string, any>()
        if (kind === 'directory')
          for (const file of Object.keys(available)) {
            const prefix = `${path.replace(/\/$/, '')}/`
            if (!file.startsWith(prefix)) continue
            const remainder = file.slice(prefix.length)
            const name = remainder.split('/', 1)[0]
            entries.set(name, {
              isDirectory: remainder.includes('/'),
              isFile: !remainder.includes('/'),
              name,
            })
          }
        return {
          isDirectory,
          isFile,
          kind,
          path,
          ...(kind === 'read' && isFile && { content: available[path] }),
          ...(kind === 'directory' && { entries: entries.values().toArray() }),
        }
      })
    },
  )
  return {
    files,
    libraries: Object.keys(files)
      .filter((path) => path.startsWith(libraryPrefix))
      .map((path) => path.slice(libraryPrefix.length)),
    requests,
  }
}

const config = (compilerOptions: any) => ({
  '/workspace/tsconfig.json': JSON.stringify({
    compilerOptions,
    files: ['file.ts'],
  }),
})

test('syntax-only and supplied programs do not read declarations', async () => {
  for (const options of [
    {},
    { project: false },
    { programs: [{}], project: './tsconfig.json' },
  ]) {
    const result = await prepare(options)
    expect(result.requests).toEqual([])
  }
})

test('default compiler libraries preserve DOM and exclude WebWorker', async () => {
  const result = await prepare({ project: './tsconfig.json' }, config({}))
  expect(result.libraries).toContain(ts.getDefaultLibFileName({}))
  expect(result.libraries).toContain('lib.dom.d.ts')
  expect(result.libraries).toContain('lib.es5.d.ts')
  expect(result.libraries).not.toContain('lib.webworker.d.ts')
  expect(result.libraries).not.toContain('lib.esnext.full.d.ts')
})

test('explicit libraries follow transitive reference-lib dependencies', async () => {
  const result = await prepare(
    { project: true },
    config({ lib: ['es2020'], types: [] }),
  )
  expect(result.libraries).toContain('lib.es2020.d.ts')
  expect(result.libraries).toContain('lib.es2019.d.ts')
  expect(result.libraries).toContain('lib.es5.d.ts')
  expect(result.libraries).not.toContain('lib.dom.d.ts')
  expect(result.libraries).not.toContain('lib.webworker.d.ts')
})

test('WebWorker libs and document reference-lib directives remain available', async () => {
  const result = await prepare(
    { project: './tsconfig.json' },
    config({ lib: ['es2020', 'webworker'], types: [] }),
    '/// <reference lib="dom" />\nconst value = 1',
  )
  expect(result.libraries).toContain('lib.webworker.d.ts')
  expect(result.libraries).toContain('lib.dom.d.ts')
  expect(result.libraries).toContain('lib.es2020.d.ts')
})

test('noLib omits libraries', async () => {
  const result = await prepare(
    { project: './tsconfig.json' },
    config({ noLib: true, types: [] }),
  )
  expect(result.libraries).toEqual([])
})

test('library discovery releases ambient type inputs and preserves project library references', async () => {
  const result = await prepare(
    { project: './tsconfig.json' },
    {
      '/workspace/node_modules/@types/extra/index.d.ts':
        'declare const unrelatedAmbient: string',
      '/workspace/other.ts':
        '/// <reference lib="dom" />\nexport const unrelated = 1',
      '/workspace/tsconfig.json': JSON.stringify({
        compilerOptions: { lib: ['es5'], types: ['extra'] },
        files: ['file.ts', 'other.ts'],
      }),
    },
  )
  expect(result.libraries).toContain('lib.es5.d.ts')
  expect(result.libraries).toContain('lib.dom.d.ts')
  expect(result.files['/workspace/other.ts']).toContain('reference lib="dom"')
  expect(
    result.files['/workspace/node_modules/@types/extra/index.d.ts'],
  ).toBeUndefined()
  expect(result.requests).toContainEqual({
    kind: 'read',
    path: '/workspace/other.ts',
  })
})

test('target and inherited package configs use TypeScript semantics', async () => {
  const result = await prepare(
    { project: './tsconfig.json' },
    {
      '/workspace/node_modules/@configs/base/base.json':
        '{"compilerOptions":{"target":"es2020","types":[]}}',
      '/workspace/node_modules/@configs/base/package.json':
        '{"tsconfig":"base.json"}',
      '/workspace/tsconfig.json':
        '{"extends":"@configs/base","files":["file.ts"]}',
    },
  )
  expect(result.libraries).toContain('lib.es2020.full.d.ts')
  expect(result.libraries).toContain('lib.dom.d.ts')
  expect(result.libraries).not.toContain('lib.webworker.d.ts')
})

test('project glob and projectService find inherited configs', async () => {
  for (const options of [
    { project: './tsconfig*.json' },
    { projectService: true },
  ]) {
    const result = await prepare(options, {
      '/workspace/base.json': '{"compilerOptions":{"lib":["es5"],"types":[]}}',
      '/workspace/tsconfig.json':
        '{"extends":"./base.json","files":["file.ts"]}',
    })
    expect(result.libraries).toContain('lib.es5.d.ts')
    expect(result.libraries).not.toContain('lib.dom.d.ts')
  }
})

test('custom lib overrides replace built-in libraries when configured', async () => {
  const customPath = '/workspace/node_modules/@typescript/lib-dom/index.d.ts'
  const result = await prepare(
    { project: './tsconfig.json' },
    {
      ...config({ lib: ['es5', 'dom'], libReplacement: true, types: [] }),
      '/workspace/node_modules/@typescript/lib-dom/package.json':
        '{"name":"@typescript/lib-dom","types":"index.d.ts"}',
      [customPath]: 'interface CustomDocument { custom: true }',
    },
  )
  expect(result.files[customPath]).toContain('CustomDocument')
  expect(result.libraries).toContain('lib.es5.d.ts')
  expect(result.libraries).not.toContain('lib.dom.d.ts')
})
