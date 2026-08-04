import { expect, test } from '@jest/globals'
import { computeTextHash } from '../src/parts/ComputeTextHash/ComputeTextHash.ts'

test('computes a sha256 hash of utf8 text', async () => {
  await expect(computeTextHash('file content')).resolves.toBe(
    'e0ac3601005dfa1864f5392aabaf7d898b1b5bab854f1acb4491bcd806b76b0c',
  )
})
