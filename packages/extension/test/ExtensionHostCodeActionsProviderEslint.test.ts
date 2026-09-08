import { expect, test } from '@jest/globals'
import * as EslintEvaluationWorker from '../src/parts/EslintEvaluationWorker/EslintEvaluationWorker.ts'
import * as CodeActionsProvider from '../src/parts/ExtensionHost/ExtensionHostCodeActionsProviderEslint.ts'
import * as IgnoreHashes from '../src/parts/IgnoreHashes/IgnoreHashes.ts'

test('ignored content does not start evaluation for code actions', async () => {
  IgnoreHashes.state.getPreference = async () => [
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  ]
  EslintEvaluationWorker.state.rpcPromise = undefined
  expect(
    await CodeActionsProvider.provideCodeActions(
      { languageId: 'javascript', text: 'hello', uri: '/workspace/file.js' },
      0,
    ),
  ).toEqual([])
  expect(EslintEvaluationWorker.state.rpcPromise).toBeUndefined()
})
