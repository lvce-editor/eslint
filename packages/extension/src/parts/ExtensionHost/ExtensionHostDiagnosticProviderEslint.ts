import type { Diagnostic } from '@lvce-editor/api'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as Lint from '../Lint/Lint.ts'
import * as LoadEslint from '../LoadEslint/LoadEslint.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'
import * as LoadSuppressions from '../LoadSuppressions/LoadSuppressions.ts'

export const id = 'eslint'

export const label = 'ESLint'

export const languageId = 'javascript'

const getErrorPosition = (
  error: unknown,
): { columnIndex: number; rowIndex: number } => {
  if (!error || typeof error !== 'object') {
    return { columnIndex: 0, rowIndex: 0 }
  }
  const location = (error as { loc?: unknown }).loc
  if (!location || typeof location !== 'object') {
    const { message } = error as { message?: unknown }
    const match =
      typeof message === 'string' ? /\((\d+):(\d+)\)/.exec(message) : undefined
    if (!match) {
      return { columnIndex: 0, rowIndex: 0 }
    }
    const [, line, column] = match
    return {
      columnIndex: Number(column),
      rowIndex: Math.max(0, Number(line) - 1),
    }
  }
  const { column, line } = location as { column?: unknown; line?: unknown }
  return {
    columnIndex: typeof column === 'number' ? Math.max(0, column) : 0,
    rowIndex: typeof line === 'number' ? Math.max(0, line - 1) : 0,
  }
}

export const provideDiagnostics = async (textDocument: {
  text: string
  uri: string
}): Promise<readonly Diagnostic[]> => {
  let configPath: string | null = null
  try {
    const { text } = textDocument
    const filePath = textDocument.uri ?? 'file.js'
    configPath = await FindEslintConfig.findEslintConfig(filePath)
    const config = configPath
      ? await LoadEslintConfig.loadEslintConfig(configPath, filePath)
      : undefined
    const suppressions = await LoadSuppressions.loadSuppressions(
      filePath,
      configPath,
    )
    const Linter = await LoadEslint.loadEslint(
      filePath,
      configPath ?? undefined,
    )
    const lintResults = await Lint.lint(
      text,
      filePath,
      config,
      Linter,
      suppressions,
    )
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
    const { columnIndex, rowIndex } = getErrorPosition(error)
    return [
      {
        columnIndex,
        endColumnIndex: columnIndex,
        endRowIndex: rowIndex,
        message: configPath
          ? `ESLint configuration error: ${message}`
          : `ESLint: ${message}`,
        rowIndex,
        source: 'eslint',
        type: 'error',
        uri: configPath ?? textDocument.uri,
      },
    ]
  }
}
