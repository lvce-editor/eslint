import { Linter } from 'eslint'
import * as FindEslintConfig from '../FindEslintConfig/FindEslintConfig.ts'
import * as LoadEslintConfig from '../LoadEslintConfig/LoadEslintConfig.ts'

export type LintResult = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  message: string
  severity: 'error' | 'warning'
  ruleId: string | null
}

const getDefaultConfig = () => ({
  languageOptions: {
    ecmaVersion: 'latest' as const,
    sourceType: 'module' as const,
    globals: {
      console: 'readonly' as const,
      process: 'readonly' as const,
      Buffer: 'readonly' as const,
      __dirname: 'readonly' as const,
      __filename: 'readonly' as const,
      global: 'readonly' as const,
      module: 'readonly' as const,
      require: 'readonly' as const,
      exports: 'readonly' as const,
    },
  },
  rules: {
    // Use ESLint's recommended rules
    'no-unused-vars': 'warn' as const,
    'no-undef': 'error' as const,
    'no-console': 'off' as const,
    'no-debugger': 'error' as const,
    'no-duplicate-case': 'error' as const,
    'no-empty': 'warn' as const,
    'no-extra-semi': 'error' as const,
    'no-func-assign': 'error' as const,
    'no-irregular-whitespace': 'error' as const,
    'no-unreachable': 'error' as const,
    'no-unsafe-finally': 'error' as const,
    'no-unsafe-negation': 'error' as const,
    'use-isnan': 'error' as const,
    'valid-typeof': 'error' as const,
  },
})

export const lint = async (
  text: string,
  filePath: string,
): Promise<LintResult[]> => {
  // Find ESLint config file
  const configFilePath = await FindEslintConfig.findEslintConfig(filePath)

  let overrideConfig = getDefaultConfig()

  if (configFilePath) {
    try {
      // Load and parse the config file
      const loadedConfig =
        await LoadEslintConfig.loadEslintConfig(configFilePath)

      // Handle flat config format (array) or legacy format (object)
      if (Array.isArray(loadedConfig)) {
        // Flat config: merge all configs
        let merged = getDefaultConfig()
        for (const config of loadedConfig) {
          merged = {
            ...merged,
            languageOptions: {
              ...merged.languageOptions,
              ...config.languageOptions,
              globals: {
                ...merged.languageOptions?.globals,
                ...config.languageOptions?.globals,
              },
            },
            rules: {
              ...merged.rules,
              ...config.rules,
            },
          }
        }
        overrideConfig = merged
      } else if (typeof loadedConfig === 'object' && loadedConfig !== null) {
        // Legacy format or single flat config object
        overrideConfig = {
          ...getDefaultConfig(),
          ...loadedConfig,
          languageOptions: {
            ...getDefaultConfig().languageOptions,
            ...(loadedConfig as { languageOptions?: unknown }).languageOptions,
          },
          rules: {
            ...getDefaultConfig().rules,
            ...(loadedConfig as { rules?: unknown }).rules,
          },
        }
      }
    } catch {
      // If config loading fails, use default config
      // Config loading errors are silently ignored
    }
  }

  // Extract directory from file path for cwd
  const pathParts = filePath.split('/')
  pathParts.pop()
  const cwd = pathParts.length > 0 ? pathParts.join('/') : '/'

  // Use Linter class which doesn't require config files
  const linter = new Linter({
    configType: 'flat',
  })

  // Convert config to flat config format (array)
  const configArray = Array.isArray(overrideConfig)
    ? overrideConfig
    : [overrideConfig]

  // Make file path relative to cwd for flat config matching
  const relativeFilePath = filePath.startsWith(cwd)
    ? filePath.slice(cwd.length + 1)
    : filePath.replace(/^\//, '')

  const results = linter.verifyAndFix(text, configArray, {
    filename: relativeFilePath,
    cwd,
  })

  const lintResults: LintResult[] = []

  for (const message of results.messages) {
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

  return lintResults
}
