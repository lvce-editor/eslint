import { expect, test } from '@jest/globals'
import extension from '../extension.json' with { type: 'json' }

test('includes the extension icon', () => {
  expect(extension.icon).toBe('./media/icon.png')
})

test('contributes the ESLint output channel', () => {
  expect(extension.outputChannels).toEqual([
    {
      id: 'eslint',
      label: 'ESLint',
    },
  ])
})

test('declares the module resolution worker', () => {
  expect(extension.rpc).toContainEqual({
    contentSecurityPolicy: ["default-src 'none'", "script-src 'self'"],
    id: 'builtin.eslint.module-resolution-worker',
    name: 'ESLint Module Resolution Worker',
    type: 'web-worker',
    url: 'dist/moduleResolutionWorkerMain.js',
  })
})

test('declares the eslint evaluation worker', () => {
  expect(extension.rpc).toContainEqual({
    contentSecurityPolicy: [
      "default-src 'none'",
      "script-src 'self' 'unsafe-eval'",
    ],
    id: 'builtin.eslint.evaluation-worker',
    name: 'ESLint Evaluation Worker',
    type: 'web-worker',
    url: 'dist/eslintEvaluationWorkerMain.js',
  })
})

test('allows dynamic evaluation only in the evaluation worker', () => {
  expect(extension.contentSecurityPolicy).toEqual([
    "default-src 'none'",
    "script-src 'self'",
  ])
  expect(
    extension.rpc.find(
      (worker) => worker.id === 'builtin.eslint.module-resolution-worker',
    )?.contentSecurityPolicy,
  ).toEqual(["default-src 'none'", "script-src 'self'"])
})

test('contributes the performance trace command', () => {
  expect(extension.activation).toContain(
    'onCommand:eslint.showPerformanceTrace',
  )
  expect(extension.commands).toContainEqual({
    id: 'eslint.showPerformanceTrace',
    label: 'ESLint: Show Performance Trace',
  })
})

test('contributes the clear cache command', () => {
  expect(extension.activation).toContain('onCommand:eslint.clearCache')
  expect(extension.commands).toContainEqual({
    id: 'eslint.clearCache',
    label: 'ESLint: Clear Cache',
  })
})
