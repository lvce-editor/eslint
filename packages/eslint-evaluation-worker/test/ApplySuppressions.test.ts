import { expect, test } from '@jest/globals'
import { Linter } from 'eslint'
import type { LoadedSuppressions } from '../src/parts/ApplySuppressions/ApplySuppressions.ts'
import * as ApplySuppressions from '../src/parts/ApplySuppressions/ApplySuppressions.ts'

const defaultRules = {
  'no-debugger': 'error' as const,
  'no-undef': 'error' as const,
  'no-unused-vars': 'warn' as const,
}

const lint = (
  text: string,
  rules: Readonly<Record<string, 'error' | 'warn'>> = defaultRules,
) => {
  const linter = new Linter({ configType: 'flat', cwd: '/workspace' })
  return linter.verify(text, [{ rules }], { filename: '/workspace/test.js' })
}

const createSuppressions = (
  suppressions: LoadedSuppressions['suppressions'],
  baseDirectory = '/workspace',
): LoadedSuppressions => ({ baseDirectory, suppressions })

test('preserves messages when no suppressions were loaded', () => {
  const messages = lint('debugger')
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      undefined,
    ),
  ).toBe(messages)
})

test('suppresses an error when the current count equals the stored count', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions({
    'test.js': { 'no-debugger': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual([])
})

test('suppresses an error when the current count is below the stored count', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions({
    'test.js': { 'no-debugger': { count: 2 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual([])
})

test('reports every error when the current count exceeds the stored count', () => {
  const messages = lint('debugger; debugger')
  const suppressions = createSuppressions({
    'test.js': { 'no-debugger': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual(messages)
})

test('does not suppress warnings', () => {
  const messages = lint('const unused = 1')
  const suppressions = createSuppressions({
    'test.js': { 'no-unused-vars': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual(messages)
})

test('suppresses only matching rules', () => {
  const messages = lint('debugger; missing')
  const suppressions = createSuppressions({
    'test.js': { 'no-debugger': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ).map((message) => message.ruleId),
  ).toEqual(['no-undef'])
})

test('uses paths relative to the suppressions file directory', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions({
    'src/test.js': { 'no-debugger': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/src/test.js',
      suppressions,
    ),
  ).toEqual([])
})

test('supports uri base directories', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions(
    { 'src/test.js': { 'no-debugger': { count: 1 } } },
    'memfs:///workspace',
  )
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/src/test.js',
      suppressions,
    ),
  ).toEqual([])
})

test('ignores suppressions for a different file', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions({
    'other.js': { 'no-debugger': { count: 1 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual(messages)
})

test('ignores zero-count suppressions', () => {
  const messages = lint('debugger')
  const suppressions = createSuppressions({
    'test.js': { 'no-debugger': { count: 0 } },
  })
  expect(
    ApplySuppressions.applySuppressions(
      messages,
      '/workspace/test.js',
      suppressions,
    ),
  ).toEqual(messages)
})
