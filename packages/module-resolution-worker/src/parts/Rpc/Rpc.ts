interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<any>
}

const getRpc = (): Rpc => {
  return (globalThis as typeof globalThis & { rpc: Rpc }).rpc
}

export const invoke = (
  method: string,
  ...params: readonly unknown[]
): Promise<any> => {
  return getRpc().invoke(method, ...params)
}
