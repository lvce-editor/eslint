import yml from 'eslint-plugin-yml'

export default [
  ...yml.configs['flat/base'],
  {
    files: ['**/*.yml'],
    rules: {
      'yml/no-empty-document': 'error',
    },
  },
]
