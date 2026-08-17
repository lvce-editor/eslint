import fs from 'node:fs'
import path from 'node:path'
import typescriptEslint from 'typescript-eslint'
import commonJsPlugin from './commonjs-plugin.cjs'
import { rules } from './.eslint-plugin-local/index.ts'

fs.readFileSync(path.join(import.meta.dirname, '.eslint-ignore'), 'utf8')

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      commonjs: { rules: commonJsPlugin.rules },
      local: { rules },
    },
    rules: {
      'local/no-foo': 'error',
    },
  },
]
