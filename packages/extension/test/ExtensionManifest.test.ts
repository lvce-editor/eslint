import { expect, test } from '@jest/globals'
import extension from '../extension.json' with { type: 'json' }

test('includes the extension icon', () => {
  expect(extension.icon).toBe('./icon.png')
})
