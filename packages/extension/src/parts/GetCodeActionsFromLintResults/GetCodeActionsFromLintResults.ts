import type { LintResult } from '../Lint/Lint.ts'

interface Edit {
  readonly endOffset: number
  readonly inserted: string
  readonly startOffset: number
}

export interface CodeAction {
  readonly edits: readonly Edit[]
  readonly kind: 'quickfix'
  readonly name: string
}

export const getCodeActionsFromLintResults = (
  results: readonly LintResult[],
  offset: number,
): readonly CodeAction[] => {
  const actions: CodeAction[] = []
  for (const result of results) {
    const { fix, ruleId } = result
    if (!fix || offset < fix.range[0] || offset > fix.range[1]) {
      continue
    }
    actions.push({
      edits: [
        {
          endOffset: fix.range[1],
          inserted: fix.text,
          startOffset: fix.range[0],
        },
      ],
      kind: 'quickfix',
      name: ruleId ? `Fix '${ruleId}' problem` : 'Fix ESLint problem',
    })
  }
  return actions
}
