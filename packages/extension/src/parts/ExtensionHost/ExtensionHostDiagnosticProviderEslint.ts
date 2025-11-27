import * as Lint from '../Lint/Lint.ts'

export const id = 'eslint'

export const label = 'ESLint'

export const languageId = 'javascript'

export const provideDiagnostics = async (
  textDocument: { getText: () => string },
): Promise<
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
  const text = textDocument.getText()
  const lintResults = await Lint.lint(text)
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
