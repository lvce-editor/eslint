interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

const getRpc = (): Rpc => {
  return (globalThis as typeof globalThis & { rpc: Rpc }).rpc
}

export const invoke = async <T>(
  method: string,
  ...params: readonly unknown[]
): Promise<T> => {
  return getRpc().invoke(method, ...params)
}
