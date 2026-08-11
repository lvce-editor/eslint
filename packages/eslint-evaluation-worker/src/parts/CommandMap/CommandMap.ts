import * as EslintEvaluation from '../EslintEvaluation/EslintEvaluation.ts'

export const commandMap: Readonly<Record<string, unknown>> = {
  'EslintEvaluation.clearCache': EslintEvaluation.clearCache,
  'EslintEvaluation.lint': EslintEvaluation.lint,
}
