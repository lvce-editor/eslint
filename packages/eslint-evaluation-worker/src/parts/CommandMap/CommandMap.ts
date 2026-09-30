import * as EslintEvaluation from '../EslintEvaluation/EslintEvaluation.ts'
import * as Worker from '../Worker/Worker.ts'

export const commandMap: Readonly<Record<string, unknown>> = {
  'EslintEvaluation.clearCache': EslintEvaluation.clearCache,
  'EslintEvaluation.lint': EslintEvaluation.lint,
  'Worker.dispose': Worker.dispose,
}
