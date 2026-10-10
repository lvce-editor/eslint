import typescriptEslint from 'typescript-eslint'

const libraryRule = {
  meta: { type: 'problem', fixable: 'code', schema: [] },
  create(context) {
    const services = context.sourceCode.parserServices
    return {
      VariableDeclarator(node) {
        if (node.id.name !== 'libraryValue') return
        const checker = services.program.getTypeChecker()
        const type = checker.getTypeAtLocation(
          services.esTreeNodeToTSNodeMap.get(node.init),
        )
        context.report({
          node: node.id,
          message: `Library type: ${checker.typeToString(type)}`,
          fix: (fixer) => fixer.replaceText(node.id, 'checkedValue'),
        })
      },
    }
  },
}

export default [
  {
    files: ['*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
    },
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['typed/**/*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: { project: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { library: { rules: { check: libraryRule } } },
    rules: { 'library/check': 'error' },
  },
]
