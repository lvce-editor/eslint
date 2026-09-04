import { expect, test } from '@jest/globals'
import type { ModuleGraph } from '../src/parts/ModuleGraph/ModuleGraph.ts'
import * as LoadEslint from '../src/parts/LoadEslint/LoadEslint.ts'
import * as LoadModuleGraph from '../src/parts/LoadModuleGraph/LoadModuleGraph.ts'

const createGraph = (source: string, id = 'eslint-graph') => {
  const graph: ModuleGraph = {
    entry: '/workspace/node_modules/eslint/index.js',
    files: {},
    id,
    modules: {
      '/workspace/node_modules/eslint/index.js': source,
    },
    resolutions: {},
  }
  return LoadModuleGraph.createModuleRuntime().evaluate(graph)
}

test('loads Linter from an eslint module graph', () => {
  const graph = createGraph(
    'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
  )

  const eslint = LoadEslint.loadEslint(graph)

  expect(eslint.Linter?.name).toBe('ProjectLinter')
})

test('rejects a project eslint package without Linter', () => {
  const graph = createGraph('module.exports = {}')

  expect(() => LoadEslint.loadEslint(graph)).toThrow(
    'Project ESLint module does not export Linter',
  )
})

test('returns the exports from an evaluated module graph', () => {
  const graph = createGraph(
    'class ProjectLinter {}; module.exports = { Linter: ProjectLinter }',
    'stable-graph-id',
  )

  const first = LoadEslint.loadEslint(graph)
  const second = LoadEslint.loadEslint(graph)

  expect(second).toBe(first)
})
