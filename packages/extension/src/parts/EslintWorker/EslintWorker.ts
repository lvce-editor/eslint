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
  let rpc: any
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  const invokeWorker = async (): Promise<any> => {
    rpc = await getInstance()
    if (timedOut) {
      await rpc.dispose()
      throw new Error(`ESLint sandbox exceeded ${timeoutMs} ms`)
    }
    return rpc.invoke(method, ...params)
  }
  try {
    return await Promise.race([
      invokeWorker(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true
          reject(new Error(`ESLint sandbox exceeded ${timeoutMs} ms`))
        }, timeoutMs)
      }),
    ])
  } catch (error) {
    state.rpcPromise = undefined
    await rpc?.dispose()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
