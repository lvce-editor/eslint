import cspell from '@cspell/eslint-plugin'

export default [
  {
    plugins: {
      '@cspell': cspell,
    },
    rules: {
      '@cspell/spellchecker': 'off',
      'no-debugger': 'error',
    },
  },
]
