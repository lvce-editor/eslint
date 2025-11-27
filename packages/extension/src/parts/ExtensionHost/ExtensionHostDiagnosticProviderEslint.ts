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
  console.log('exec', filePath)
  const lintResults = await Lint.lint(text, filePath)
  console.log({ lintResults })
  return lintResults.map((result) => ({
    line: result.line,
    column: result.column,
    endLine: result.endLine,
    endColumn: result.endColumn,
    message: result.message,
    severity: result.severity,
    source: result.ruleId ?? 'eslint',
  }))
}
