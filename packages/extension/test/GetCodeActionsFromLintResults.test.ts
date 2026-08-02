import { expect, test } from '@jest/globals'
import type { LintResult } from '../src/parts/Lint/Lint.ts'
import * as GetCodeActionsFromLintResults from '../src/parts/GetCodeActionsFromLintResults/GetCodeActionsFromLintResults.ts'

const createResult = (overrides: Partial<LintResult> = {}): LintResult => ({
  column: 15,
  line: 1,
  message: 'Strings must use singlequote.',
  ruleId: 'quotes',
  severity: 'error',
  ...overrides,
})

test('returns an edit for a fix at the cursor', () => {
  const results = [
    createResult({
      fix: {
        range: [14, 20],
        text: "'test'",
      },
    }),
  ]

  expect(
    GetCodeActionsFromLintResults.getCodeActionsFromLintResults(results, 15),
  ).toEqual([
    {
      edits: [{ endOffset: 20, inserted: "'test'", startOffset: 14 }],
      kind: 'quickfix',
      name: "Fix 'quotes' problem",
    },
  ])
})

test('ignores fixes away from the cursor', () => {
  const results = [
    createResult({
      fix: {
        range: [14, 20],
        text: "'test'",
      },
    }),
  ]

  expect(
    GetCodeActionsFromLintResults.getCodeActionsFromLintResults(results, 3),
  ).toEqual([])
})

test('ignores lint results without a fix', () => {
  expect(
    GetCodeActionsFromLintResults.getCodeActionsFromLintResults(
      [createResult()],
      15,
    ),
  ).toEqual([])
})
