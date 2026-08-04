import unicorn from 'eslint-plugin-unicorn'

export default [
  {
    plugins: { unicorn },
    rules: {
      'unicorn/no-for-each': 'error',
    },
  },
]
