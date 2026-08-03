import type { Diagnostic } from '@lvce-editor/api'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

export const id = 'eslint'

export const label = 'ESLint'

export const languageId = 'javascript'

export const provideDiagnostics = async (textDocument: {
  text: string
  uri: string
}): Promise<readonly Diagnostic[]> => {
  try {
    const { text } = textDocument
    const filePath = textDocument.uri ?? 'file.js'
    const configPath = await FindEslintConfig.findEslintConfig(filePath)
    const config = configPath
      ? await LoadEslintConfig.loadEslintConfig(configPath)
      : undefined
    const Linter = await LoadEslint.loadEslint(filePath)
    const lintResults = await Lint.lint(text, filePath, config, Linter)
    return lintResults.map((result) => ({
      columnIndex: result.column - 1,
      endColumnIndex: (result.endColumn ?? result.column) - 1,
      endRowIndex: (result.endLine ?? result.line) - 1,
      message: result.message,
      rowIndex: result.line - 1,
      source: result.ruleId ?? 'eslint',
      type: result.severity,
      uri: filePath,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return [
      {
        columnIndex: 0,
        endColumnIndex: 0,
        endRowIndex: 0,
        message: `ESLint: ${message}`,
        rowIndex: 0,
        source: 'eslint',
        type: 'error',
        uri: textDocument.uri,
      },
    ]
  }
}
