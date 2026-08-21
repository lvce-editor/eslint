import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as GetCodeActionsFromLintResults from '../GetCodeActionsFromLintResults/GetCodeActionsFromLintResults.ts'

export interface TextDocument {
  readonly languageId: string
  readonly text: string
  readonly uri: string
}

export const provideCodeActions = async (
  textDocument: TextDocument,
  offset: number,
) => {
  try {
    const filePath = textDocument.uri ?? 'file.js'
    const configPath = await FindEslintConfig.findEslintConfig(filePath)
    const lintResults = await EslintEvaluationWorker.lint(
      textDocument.text,
      filePath,
      configPath ?? undefined,
    )
    return GetCodeActionsFromLintResults.getCodeActionsFromLintResults(
      lintResults,
      offset,
      textDocument.text,
      textDocument.languageId,
    )
  } catch {
    return []
  }
}
