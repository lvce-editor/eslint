import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  {
    ...reactHooks.configs.flat.recommended,
    files: ['**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
  },
]
