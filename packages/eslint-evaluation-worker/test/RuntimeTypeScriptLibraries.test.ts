/// <reference types="node" />
import { expect, test } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as LoadModuleGraph from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'

// cspell:ignore esfive

test.each([
  {
    baseDirectory: '/workspace',
    custom: false,
    filePath: '/workspace/src/file.ts',
    name: 'POSIX',
    prefix: 'memfs:///workspace/',
    project: './tsconfig.json',
    provided: false,
  },
  {
    baseDirectory: 'C:\\workspace',
    custom: false,
    filePath: 'C:\\workspace\\src\\file.ts',
    name: 'Windows',
    prefix: 'memfs:///C:/workspace/',
    project: 'C:\\workspace\\tsconfig.json',
    provided: false,
  },
  {
    baseDirectory: '/workspace',
    custom: true,
    filePath: '/workspace/src/file.ts',
    name: 'custom library',
    prefix: 'memfs:///workspace/',
    project: './tsconfig.json',
    provided: false,
  },
  {
    baseDirectory: '/workspace',
    custom: false,
    filePath: '/workspace/src/file.ts',
    name: 'supplied Program',
    prefix: 'memfs:///workspace/',
    project: './tsconfig.json',
    provided: true,
  },
  {
    baseDirectory: '/workspace',
    custom: true,
    filePath: '/workspace/src/file.ts',
    name: 'supplied custom Program',
    prefix: 'memfs:///workspace/',
    project: './tsconfig.json',
    provided: true,
  },
])(
  'hydrates $name URI projects and included documents before real typed parsing',
  async ({ baseDirectory, custom, filePath, prefix, project, provided }) => {
    const compilerPath = createRequire(import.meta.url).resolve('typescript')
    const libraryDirectory = dirname(compilerPath)
    const virtualRoot = new URL(prefix).pathname.slice(0, -1)
    const compiler = `${prefix}node_modules/typescript/lib/typescript.js`
    const entry = `${prefix}eslint.config.js`
    const available: Record<string, string> = {
      [`${prefix}src/file.ts`]: 'const libraryValue = document.title',
      [`${prefix}src/second.ts`]: '/// <reference lib="dom" />',
      [`${prefix}tsconfig.json`]:
        '{"compilerOptions":{"lib":["es5"],"types":[]},"include":["src/**/*.ts"]}',
    }
    if (custom) {
      available[`${prefix}tsconfig.json`] =
        '{"compilerOptions":{"lib":["es5","dom"],"libReplacement":true,"types":[]},"include":["src/**/*.ts"]}'
      available[`${prefix}node_modules/@typescript/lib-dom/package.json`] =
        '{"name":"@typescript/lib-dom","types":"index.d.ts"}'
      available[`${prefix}node_modules/@typescript/lib-dom/index.d.ts`] =
        'declare const document: { title: string }; interface CustomDocument { custom: true }'
    }
    for (const name of readdirSync(libraryDirectory)) {
      if (/^lib.*\.d\.ts$/.test(name))
        available[`${prefix}node_modules/typescript/lib/${name}`] =
          readFileSync(join(libraryDirectory, name), 'utf8')
    }
    const requests: string[] = []
    const rpc = {
      invoke: async (method: string, batch: readonly any[]) => {
        expect(method).toBe('ModuleResolution.readTypeScriptFiles')
        return batch.map(({ kind, path }) => {
          expect(new URL(path).protocol).toBe('memfs:')
          requests.push(path)
          const isFile = Object.hasOwn(available, path)
          const directoryPrefix = `${path.replace(/\/$/, '')}/`
          const children = Object.keys(available).filter((file) =>
            file.startsWith(directoryPrefix),
          )
          const entries = new Map<string, any>()
          for (const file of children) {
            const relative = file.slice(directoryPrefix.length)
            const name = relative.split('/', 1)[0]
            entries.set(name, {
              isDirectory: relative.includes('/'),
              isFile: !relative.includes('/'),
              name,
            })
          }
          return {
            isDirectory: children.length > 0,
            isFile,
            kind,
            path,
            ...(kind === 'read' && isFile && { content: available[path] }),
            ...(kind === 'directory' && {
              entries: entries.values().toArray(),
            }),
          }
        })
      },
    }
    Object.defineProperty(globalThis, 'rpc', { configurable: true, value: rpc })
    const runtime = LoadModuleGraph.createModuleRuntime()
    const graph = await runtime.evaluateWithFiles({
      entry,
      files: { [`${prefix}src/file.ts`]: available[`${prefix}src/file.ts`] },
      id: 'uri-typescript',
      modules: {
        [compiler]: readFileSync(compilerPath, 'utf8'),
        [entry]: provided
          ? `const ts = require('typescript'); module.exports = ts.createProgram(['${virtualRoot}/src/file.ts', '${virtualRoot}/src/second.ts'], { lib: ['lib.es5.d.ts', 'lib.dom.d.ts'], types: [], libReplacement: ${custom} });`
          : 'module.exports = []',
      },
      resolutions: { [`${entry}\0typescript`]: compiler },
    })
    if (provided) {
      const program = graph.exports
      const node = program.getSourceFile(`${virtualRoot}/src/file.ts`)
        .statements[0].declarationList.declarations[0].initializer
      expect(
        program
          .getTypeChecker()
          .typeToString(program.getTypeChecker().getTypeAtLocation(node)),
      ).toBe('string')
    }
    await graph.prepareTypeScriptLibraries!(
      available[`${prefix}src/file.ts`],
      filePath,
      baseDirectory,
      { project, tsconfigRootDir: baseDirectory },
    )
    expect(requests).toContain(`${prefix}src/second.ts`)
    const inspection = `${prefix}inspection.js`
    const result = runtime.evaluate({
      entry: inspection,
      id: 'inspect-uri-typescript',
      modules: {
        [inspection]:
          `const ts = require('typescript'); const fs = require('fs');
      const config = ts.getParsedCommandLineOfConfigFile('/workspace/tsconfig.json', {}, ts.sys);
      const program = ts.createProgram(config.fileNames, config.options);
      const node = program.getSourceFile('/workspace/src/file.ts').statements[0].declarationList.declarations[0].initializer;
      module.exports = { type: program.getTypeChecker().typeToString(program.getTypeChecker().getTypeAtLocation(node)), dom: (() => { try { fs.readFileSync('/workspace/node_modules/typescript/lib/lib.dom.d.ts'); return true } catch { return false } })(), worker: fs.existsSync('/workspace/node_modules/typescript/lib/lib.webworker.d.ts') }`.replaceAll(
            '/workspace',
            () => virtualRoot,
          ),
      },
      resolutions: { [`${inspection}\0typescript`]: compiler },
    }).exports
    expect(result).toEqual({ dom: !custom, type: 'string', worker: false })
    if (custom)
      expect(requests).toContain(
        `${prefix}node_modules/@typescript/lib-dom/index.d.ts`,
      )
    const initialRequests = requests.length
    await graph.prepareTypeScriptLibraries!(
      available[`${prefix}src/file.ts`].replace('libraryValue', 'renamedValue'),
      filePath,
      baseDirectory,
      { project, tsconfigRootDir: baseDirectory },
    )
    expect(requests).toHaveLength(initialRequests)
    await graph.prepareTypeScriptLibraries!(
      '/// <reference lib="webworker" />\n' + available[`${prefix}src/file.ts`],
      filePath,
      baseDirectory,
      { project, tsconfigRootDir: baseDirectory },
    )
    expect(requests).toContain(
      `${prefix}node_modules/typescript/lib/lib.webworker.d.ts`,
    )
  },
)
