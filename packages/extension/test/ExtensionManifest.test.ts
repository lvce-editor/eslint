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
