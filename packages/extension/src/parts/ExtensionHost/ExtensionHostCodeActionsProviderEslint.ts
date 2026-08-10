import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as GetCodeActionsFromLintResults from '../GetCodeActionsFromLintResults/GetCodeActionsFromLintResults.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

export interface TextDocument {
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
    const config = configPath
      ? await LoadEslintConfig.loadEslintConfig(configPath, filePath)
      : undefined
    const Linter = await LoadEslint.loadEslint(
      filePath,
      configPath ?? undefined,
    )
    const lintResults = await Lint.lint(
      textDocument.text,
      filePath,
      config,
      Linter,
    )
    return GetCodeActionsFromLintResults.getCodeActionsFromLintResults(
      lintResults,
      offset,
    )
  } catch {
    return []
  }
}
