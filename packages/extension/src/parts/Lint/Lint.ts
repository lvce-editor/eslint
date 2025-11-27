import { ESLint } from 'eslint'

export type LintResult = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  severity: 'error' | 'warning'
  ruleId: string | null
}

export const lint = async (text: string): Promise<LintResult[]> => {
  const eslint = new ESLint({
    overrideConfigFile: null,
    overrideConfig: {
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
          console: 'readonly',
          process: 'readonly',
          Buffer: 'readonly',
          __dirname: 'readonly',
          __filename: 'readonly',
          global: 'readonly',
          module: 'readonly',
          require: 'readonly',
          exports: 'readonly',
        },
      },
      rules: {
        // Use ESLint's recommended rules
        'no-unused-vars': 'warn',
        'no-undef': 'error',
        'no-console': 'off',
        'no-debugger': 'error',
        'no-duplicate-case': 'error',
        'no-empty': 'warn',
        'no-extra-semi': 'error',
        'no-func-assign': 'error',
        'no-irregular-whitespace': 'error',
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-unsafe-negation': 'error',
        'use-isnan': 'error',
        'valid-typeof': 'error',
      },
    },
  })

  const results = await eslint.lintText(text, {
    filePath: 'file.js',
  })

  const lintResults: LintResult[] = []

  for (const result of results) {
    for (const message of result.messages) {
      lintResults.push({
        line: message.line,
        column: message.column,
        endLine: message.endLine ?? undefined,
        endColumn: message.endColumn ?? undefined,
        message: message.message,
        severity: message.severity === 2 ? 'error' : 'warning',
        ruleId: message.ruleId,
      })
    }
  }

  return lintResults
}
