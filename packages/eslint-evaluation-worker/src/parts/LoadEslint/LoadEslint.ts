import type { ESLint, Linter } from 'eslint'
import type { EvaluatedModuleGraph } from '../ModuleRuntime/ModuleRuntime.ts'

export type EslintModule = {
  readonly ESLint?: typeof ESLint
  readonly Linter?: LinterConstructor
}

type LinterConstructor = typeof Linter

export const loadEslint = (graph: EvaluatedModuleGraph): EslintModule => {
  const eslint = graph.exports as EslintModule
  if (typeof eslint.Linter !== 'function') {
    throw new TypeError(
      `Project ESLint module does not export Linter: ${graph.entry}`,
    )
  }
  return eslint
}
