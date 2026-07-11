import * as EslintWorker from '../EslintWorker/EslintWorker.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

export const id = 'eslint'

export const label = 'ESLint'

export const languageId = 'javascript'

export const provideDiagnostics = async (textDocument: {
  text: string
  uri: string
}): Promise<
  Array<{
    line: number
    column: number
    endLine?: number
    endColumn?: number
    message: string
    severity: 'error' | 'warning'
    source: string
  }>
> => {
  try {
    const { text } = textDocument
    const filePath = textDocument.uri ?? 'file.js'
    const configPath = await FindEslintConfig.findEslintConfig(filePath)
    const config = configPath
      ? await LoadEslintConfig.loadEslintConfig(configPath)
      : undefined
    const lintResults = await EslintWorker.invoke(
      'Lint.lint',
      text,
      filePath,
      config,
    )
    return lintResults.map((result) => ({
      column: result.column,
      endColumn: result.endColumn,
      endLine: result.endLine,
      line: result.line,
      message: result.message,
      severity: result.severity,
      source: result.ruleId ?? 'eslint',
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return [
      {
        column: 1,
        endColumn: 1,
        endLine: 1,
        line: 1,
        message: `ESLint: ${message}`,
        severity: 'error',
        source: 'eslint',
      },
    ]
  }
}
