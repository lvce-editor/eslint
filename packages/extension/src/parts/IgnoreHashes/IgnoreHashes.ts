import { getPreference } from '@lvce-editor/api'
import * as ComputeTextHash from '../ComputeTextHash/ComputeTextHash.ts'

export const state = { getPreference }

export const isIgnored = async (text: string): Promise<boolean> => {
  try {
    const hashes: unknown = await state.getPreference('eslint.ignoreHashes')
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return false
    }
    const hash = await ComputeTextHash.computeTextHash(text)
    return hashes.includes(hash)
  } catch {
    // Unavailable preferences or hashing must not disable linting.
    return false
  }
}
