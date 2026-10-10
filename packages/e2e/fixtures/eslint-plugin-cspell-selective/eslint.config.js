import cspell from '@cspell/eslint-plugin'

export default [
  {
    plugins: { '@cspell': cspell },
    rules: {
      '@cspell/spellchecker': ['error', { autoFix: true }],
      'no-debugger': 'error',
    },
  },
  {
    files: ['explicit.js'],
    rules: {
      '@cspell/spellchecker': [
        'error',
        { cspell: { dictionaries: ['python'] } },
      ],
    },
  },
  {
    files: ['disabled.js'],
    rules: { '@cspell/spellchecker': 'off' },
  },
]
