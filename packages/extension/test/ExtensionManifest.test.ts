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
