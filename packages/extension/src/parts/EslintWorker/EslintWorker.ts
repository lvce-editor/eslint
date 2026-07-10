import * as EslintWorkerUrl from '../EslintWorkerUrl/EslintWorkerUrl.ts'

const state: { rpcPromise?: Promise<any> } = {}
const timeoutMs = 10_000

export const getInstance = async (): Promise<any> => {
  if (!state.rpcPromise) {
    // @ts-ignore
    state.rpcPromise = vscode.createRpc({
      commandMap: {},
      contentSecurityPolicy:
        "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'",
      name: 'ESLint Sandbox Worker',
      type: 'worker',
      url: EslintWorkerUrl.eslintWorkerUrl,
    })
  }
  return state.rpcPromise
}

export const invoke = async (
  method: string,
  ...params: readonly unknown[]
): Promise<any> => {
  const rpc = await getInstance()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      rpc.invoke(method, ...params),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`ESLint sandbox exceeded ${timeoutMs} ms`))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    state.rpcPromise = undefined
    await rpc.dispose()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
