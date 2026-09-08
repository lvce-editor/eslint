import * as EslintEvaluationWorker from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as GetCodeActionsFromLintResults from '../GetCodeActionsFromLintResults/GetCodeActionsFromLintResults.ts'
import * as IgnoreHashes from '../IgnoreHashes/IgnoreHashes.ts'

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
    if (await IgnoreHashes.isIgnored(textDocument.text)) {
      return []
    }
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
