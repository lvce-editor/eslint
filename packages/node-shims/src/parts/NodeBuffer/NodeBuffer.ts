/* eslint-disable unicorn/no-global-object-property-assignment */

export const installNodeBuffer = (): void => {
  if (typeof Buffer !== 'undefined') {
    return
  }

  globalThis.Buffer = {
    alloc: (size: number) => new Uint8Array(size),
    allocUnsafe: (size: number) => new Uint8Array(size),
    allocUnsafeSlow: (size: number) => new Uint8Array(size),
    bigint: undefined,
    byteLength: (data: unknown): number => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data).length
      }
      if (data instanceof ArrayBuffer) {
        return data.byteLength
      }
      if (data instanceof Uint8Array) {
        return data.length
      }
      return 0
    },
    compare: (a: number, b: number): number => {
      if (a < b) return -1
      if (a > b) return 1
      return 0
    },
    concat: (list: readonly unknown[], totalLength?: number): Uint8Array => {
      const arrays = list.map((item) => {
        if (item instanceof Uint8Array) return item
        if (typeof item === 'string') return new TextEncoder().encode(item)
        return new Uint8Array(0)
      })
      const total =
        totalLength || arrays.reduce((sum, array) => sum + array.length, 0)
      const result = new Uint8Array(total)
      let offset = 0
      for (const array of arrays) {
        result.set(array, offset)
        offset += array.length
      }
      return result
    },
    from: (data: string | Uint8Array): Uint8Array => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data)
      }
      return data
    },
    isBuffer: (): boolean => false,
  }
}
