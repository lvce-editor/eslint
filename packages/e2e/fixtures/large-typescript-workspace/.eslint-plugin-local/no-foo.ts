import type { Rule } from 'eslint'

const rule: Rule.RuleModule = {
  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'foo') {
          context.report({ message: 'Do not use foo', node })
        }
      },
    }
  },
}

export default rule
