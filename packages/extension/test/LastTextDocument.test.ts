import { afterEach, expect, test } from '@jest/globals'
import * as LastTextDocument from '../src/parts/LastTextDocument/LastTextDocument.ts'

afterEach(() => {
  LastTextDocument.reset()
})

test('returns the most recently linted text document', () => {
  const textDocument = {
    text: 'debugger',
    uri: 'file:///test.js',
  }

  LastTextDocument.set(textDocument)

  expect(LastTextDocument.get()).toBe(textDocument)
})
