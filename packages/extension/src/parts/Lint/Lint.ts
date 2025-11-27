import { ESLint } from 'eslint'
import * as EslintFileSystem from '../EslintFileSystem/EslintFileSystem.ts'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'

export type LintResult = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  severity: 'error' | 'warning'
  ruleId: string | null
}

export const lint = async (
  text: string,
  filePath: string,
): Promise<LintResult[]> => {
  // Extract directory from file path for file system operations
  const pathParts = filePath.split('/')
  pathParts.pop()
  const basePath = pathParts.length > 0 ? pathParts.join('/') : '/'

  // Create custom file system that uses RPC
  const fileSystem = EslintFileSystem.createEslintFileSystem(basePath)

  // Find ESLint config file
  const configFilePath = await FindEslintConfig.findEslintConfig(filePath)

  const eslintOptions: {
    overrideConfigFile?: string | null
    overrideConfig?: {
      languageOptions: {
        ecmaVersion: string
        sourceType: string
        globals: Record<string, string>
      }
      rules: Record<string, string>
    }
    fileSystem: typeof fileSystem
  } = {
    fileSystem,
  }

  if (configFilePath) {
    // Use the found config file
    eslintOptions.overrideConfigFile = configFilePath
  } else {
    // Fallback to default config if no config file found
    eslintOptions.overrideConfig = {
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
    }
  }

  const eslint = new ESLint(eslintOptions)

  const results = await eslint.lintText(text, {
    filePath,
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
