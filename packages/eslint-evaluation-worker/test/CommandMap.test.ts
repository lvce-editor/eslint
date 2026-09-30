import { expect, test } from '@jest/globals'
import * as CommandMap from '../src/parts/CommandMap/CommandMap.ts'
import * as Worker from '../src/parts/Worker/Worker.ts'

test('registers the worker disposal command', () => {
  expect(CommandMap.commandMap['Worker.dispose']).toBe(Worker.dispose)
})
