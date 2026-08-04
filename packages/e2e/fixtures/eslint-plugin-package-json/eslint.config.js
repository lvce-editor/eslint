import packageJson from 'eslint-plugin-package-json'

export default [
  {
    files: ['**/package.json'],
    languageOptions: packageJson.configs.recommended.languageOptions,
    plugins: {
      'package-json': packageJson,
    },
    rules: {
      'package-json/require-description': 'error',
    },
  },
]
