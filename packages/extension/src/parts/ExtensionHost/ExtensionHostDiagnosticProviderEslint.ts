import * as Lint from '../Lint/Lint.ts'

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
  const { text } = textDocument
  const filePath = textDocument.uri ?? 'file.js'
  const lintResults = await Lint.lint(text, filePath)
  return lintResults.map((result) => ({
    column: result.column,
    endColumn: result.endColumn,
    endLine: result.endLine,
    line: result.line,
    message: result.message,
    severity: result.severity,
    source: result.ruleId ?? 'eslint',
  }))
}
