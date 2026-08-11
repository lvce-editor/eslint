import { beforeEach, expect, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as LoadEslint from '../src/parts/LoadEslint/LoadEslint.ts'

const createGraph = (source: string, id = 'eslint-graph'): ModuleGraph => ({
  entry: '/workspace/node_modules/eslint/index.js',
  files: {},
  id,
  modules: {
    '/workspace/node_modules/eslint/index.js': source,
  },
  resolutions: {},
})

beforeEach(() => {
  LoadEslint.clearCache()
})

test('loads Linter from an eslint module graph', () => {
  const graph = createGraph(
    'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
  )

  const Linter = LoadEslint.loadEslint(graph)

  expect(Linter.name).toBe('ProjectLinter')
})

test('rejects a project eslint package without Linter', () => {
  const graph = createGraph('module.exports = {}')

  expect(() => LoadEslint.loadEslint(graph)).toThrow(
    'Project ESLint module does not export Linter',
  )
})

test('reuses an evaluated module graph after structured cloning', () => {
  const graph = createGraph(
    'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    'stable-graph-id',
  )

  const first = LoadEslint.loadEslint(graph)
  const second = LoadEslint.loadEslint(structuredClone(graph))

  expect(second).toBe(first)
})
