import { expect, test } from '@jest/globals'
import type { LintResult } from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as GetCodeActionsFromLintResults from '../src/parts/GetCodeActionsFromLintResults/GetCodeActionsFromLintResults.ts'

const createResult = (overrides: Partial<LintResult> = {}): LintResult => ({
  column: 15,
  endColumn: 21,
  endLine: 1,
  line: 1,
  message: 'Strings must use singlequote.',
  ruleId: 'quotes',
  severity: 'error',
  ...overrides,
})

const getActions = (
  text: string,
  results: readonly LintResult[] = [createResult()],
  offset = 15,
  languageId = 'javascript',
) => {
  return GetCodeActionsFromLintResults.getCodeActionsFromLintResults(
    results,
    offset,
    text,
    languageId,
  )
}

test('returns fix and disable actions for a fixable problem', () => {
  const text = 'const value = "test"'
  const results = [
    createResult({
      fix: {
        range: [14, 20],
        text: "'test'",
      },
    }),
  ]

  expect(getActions(text, results)).toEqual([
    {
      edits: [{ endOffset: 20, inserted: "'test'", startOffset: 14 }],
      kind: 'quickfix',
      name: "Fix 'quotes' problem",
    },
    {
      edits: [
        {
          endOffset: 0,
          inserted: '// eslint-disable-next-line quotes\n',
          startOffset: 0,
        },
      ],
      kind: 'quickfix',
      name: 'Disable quotes for this line',
    },
    {
      edits: [
        {
          endOffset: 0,
          inserted: '/* eslint-disable quotes */\n',
          startOffset: 0,
        },
      ],
      kind: 'quickfix',
      name: 'Disable quotes for the entire file',
    },
  ])
})

test('returns disable actions for a non-fixable problem', () => {
  const text = "console.log('test')"
  const results = [
    createResult({
      column: 1,
      endColumn: 12,
      message: 'Unexpected console statement.',
      ruleId: 'no-console',
    }),
  ]

  expect(getActions(text, results, 5)).toEqual([
    {
      edits: [
        {
          endOffset: 0,
          inserted: '// eslint-disable-next-line no-console\n',
          startOffset: 0,
        },
      ],
      kind: 'quickfix',
      name: 'Disable no-console for this line',
    },
    {
      edits: [
        {
          endOffset: 0,
          inserted: '/* eslint-disable no-console */\n',
          startOffset: 0,
        },
      ],
      kind: 'quickfix',
      name: 'Disable no-console for the entire file',
    },
  ])
})

test('ignores problems away from the cursor', () => {
  const text = 'const value = "test"'
  expect(getActions(text, [createResult()], 3)).toEqual([])
})

test('uses the rest of the line when eslint omits the end position', () => {
  const text = "console.log('test')"
  const result = createResult({
    column: 1,
    endColumn: undefined,
    endLine: undefined,
    ruleId: 'no-console',
  })

  expect(getActions(text, [result], text.length)).toHaveLength(2)
})

test('preserves indentation for a line directive', () => {
  const text = "function main() {\n  console.log('test')\n}"
  const result = createResult({
    column: 3,
    endColumn: 14,
    endLine: 2,
    line: 2,
    ruleId: 'no-console',
  })

  expect(getActions(text, [result], text.indexOf('console'))[0]).toEqual({
    edits: [
      {
        endOffset: text.indexOf('  console'),
        inserted: '  // eslint-disable-next-line no-console\n',
        startOffset: text.indexOf('  console'),
      },
    ],
    kind: 'quickfix',
    name: 'Disable no-console for this line',
  })
})

test('merges with an existing line disable-next-line directive', () => {
  const text =
    "// eslint-disable-next-line no-debugger\ndebugger; console.log('test')"
  const result = createResult({
    column: 11,
    endColumn: 22,
    endLine: 2,
    line: 2,
    ruleId: 'no-console',
  })
  const insertionOffset = text.indexOf('\n')

  expect(getActions(text, [result], text.indexOf('console'))[0]).toEqual({
    edits: [
      {
        endOffset: insertionOffset,
        inserted: ', no-console',
        startOffset: insertionOffset,
      },
    ],
    kind: 'quickfix',
    name: 'Disable no-console for this line',
  })
})

test('merges before the closing tag of an existing block directive', () => {
  const text =
    "/* eslint-disable-next-line no-debugger */\ndebugger; console.log('test')"
  const result = createResult({
    column: 11,
    endColumn: 22,
    endLine: 2,
    line: 2,
    ruleId: 'no-console',
  })
  const insertionOffset = text.indexOf(' */')

  expect(getActions(text, [result], text.indexOf('console'))[0]).toEqual({
    edits: [
      {
        endOffset: insertionOffset,
        inserted: ', no-console',
        startOffset: insertionOffset,
      },
    ],
    kind: 'quickfix',
    name: 'Disable no-console for this line',
  })
})

test('inserts a file directive after a shebang', () => {
  const text = "#!/usr/bin/env node\nconsole.log('test')"
  const result = createResult({
    column: 1,
    endColumn: 12,
    endLine: 2,
    line: 2,
    ruleId: 'no-console',
  })
  const actions = getActions(text, [result], text.indexOf('console'))

  expect(actions[1]).toEqual({
    edits: [
      {
        endOffset: text.indexOf('\n') + 1,
        inserted: '/* eslint-disable no-console */\n',
        startOffset: text.indexOf('\n') + 1,
      },
    ],
    kind: 'quickfix',
    name: 'Disable no-console for the entire file',
  })
})

test('inserts a file directive after a byte order mark', () => {
  // eslint-disable-next-line e18e/prefer-string-fromcharcode
  const text = `${String.fromCodePoint(65_279)}console.log('test')`
  const result = createResult({
    column: 2,
    endColumn: 13,
    ruleId: 'no-console',
  })
  const actions = getActions(text, [result], 5)

  expect(actions[1].edits).toEqual([
    {
      endOffset: 1,
      inserted: '/* eslint-disable no-console */\n',
      startOffset: 1,
    },
  ])
})

test('preserves CRLF line endings', () => {
  const text = 'const value = 1\r\nconsole.log(value)\r\n'
  const result = createResult({
    column: 1,
    endColumn: 12,
    endLine: 2,
    line: 2,
    ruleId: 'no-console',
  })
  const actions = getActions(text, [result], text.indexOf('console'))

  expect(actions[0].edits[0].inserted).toBe(
    '// eslint-disable-next-line no-console\r\n',
  )
  expect(actions[1].edits[0].inserted).toBe(
    '/* eslint-disable no-console */\r\n',
  )
})

test('uses yaml comments', () => {
  const text = '---\n'
  const result = createResult({
    column: 1,
    endColumn: 4,
    ruleId: 'yml/no-empty-document',
  })
  const actions = getActions(text, [result], 1, 'yaml')

  expect(actions[0].edits[0].inserted).toBe(
    '# eslint-disable-next-line yml/no-empty-document\n',
  )
  expect(actions[1].edits[0].inserted).toBe(
    '# eslint-disable yml/no-empty-document\n',
  )
})

test('uses block comments for css', () => {
  const text = '.example { color: red !important; }'
  const result = createResult({
    column: 23,
    endColumn: 33,
    ruleId: 'css/no-important',
  })
  const actions = getActions(text, [result], 25, 'css')

  expect(actions[0].edits[0].inserted).toBe(
    '/* eslint-disable-next-line css/no-important */\n',
  )
  expect(actions[1].edits[0].inserted).toBe(
    '/* eslint-disable css/no-important */\n',
  )
})

test('does not return disable actions for parsing errors', () => {
  const text = 'const value ='
  const result = createResult({
    column: 14,
    endColumn: 14,
    message: 'Parsing error: Unexpected token',
    ruleId: null,
  })

  expect(getActions(text, [result], 13)).toEqual([])
})

test('deduplicates actions for the same rule', () => {
  const text = 'missing + missing'
  const first = createResult({
    column: 1,
    endColumn: 8,
    ruleId: 'no-undef',
  })
  const second = createResult({
    column: 11,
    endColumn: 18,
    ruleId: 'no-undef',
  })

  expect(getActions(text, [first, second], 5)).toHaveLength(2)
})
