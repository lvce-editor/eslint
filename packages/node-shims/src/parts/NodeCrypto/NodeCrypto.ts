/* eslint-disable unicorn/no-this-outside-of-class, unicorn/prefer-code-point */

export const createNodeCrypto = () => ({
  createHash: (_algorithm: string) => {
    let hash = 0
    return {
      digest: (_encoding: string): string => {
        return Math.abs(hash).toString(16)
      },
      update: (data: unknown) => {
        const value = typeof data === 'string' ? data : String(data)
        for (let index = 0; index < value.length; index++) {
          hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
        }
        return this
      },
    }
  },
  randomBytes: (size: number) => {
    const array = new Uint8Array(size)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      for (let index = 0; index < size; index++) {
        array[index] = Math.floor(Math.random() * 256)
      }
    }
    return {
      length: array.length,
      toString: (encoding: string): string => {
        if (encoding === 'hex') {
          return Array.from(array, (value) =>
            value.toString(16).padStart(2, '0'),
          ).join('')
        }
        return String.fromCharCode(...array)
      },
    }
  },
})
