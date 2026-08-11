import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { RunningServer } from './types.ts'
import { stopProcess } from './process.ts'

const getFreePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, 'localhost', resolvePromise)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not allocate a TCP port')
  }
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  )
  return address.port
}

const canConnect = async (url: string): Promise<boolean> => {
  return new Promise((resolvePromise) => {
    const outgoing = request(
      url,
      { method: 'GET', timeout: 1000 },
      (response) => {
        response.resume()
        resolvePromise(
          Boolean(response.statusCode && response.statusCode < 500),
        )
      },
    )
    outgoing.on('error', () => resolvePromise(false))
    outgoing.on('timeout', () => {
      outgoing.destroy()
      resolvePromise(false)
    })
    outgoing.end()
  })
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  )
}

export const startServer = async ({
  extensionPath,
  serverPath,
  testPath,
  timeout,
  workspace,
}: {
  readonly extensionPath: string
  readonly serverPath: string
  readonly testPath: string
  readonly timeout: number
  readonly workspace: string
}): Promise<RunningServer> => {
  const port = await getFreePort()
  const runtimeDirectory = await mkdtemp(join(testPath, 'runtime-'))
  const child = spawn(
    process.execPath,
    [
      serverPath,
      workspace,
      `--only-extension=${extensionPath}`,
      `--test-path=${testPath}`,
    ],
    {
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        FOLDER: workspace,
        PORT: String(port),
        XDG_CACHE_HOME: join(runtimeDirectory, 'cache'),
        XDG_CONFIG_HOME: join(runtimeDirectory, 'config'),
        XDG_DATA_HOME: join(runtimeDirectory, 'data'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })

  const url = `http://localhost:${port}`
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeout) {
    if (child.exitCode !== null || child.signalCode !== null) {
      await rm(runtimeDirectory, { force: true, recursive: true })
      throw new Error(`LVCE server exited during startup\n${output}`)
    }
    if (await canConnect(url)) {
      return {
        close: async () => {
          await stopProcess(child)
          await rm(runtimeDirectory, { force: true, recursive: true })
        },
        url,
      }
    }
    await wait(100)
  }

  await stopProcess(child)
  await rm(runtimeDirectory, { force: true, recursive: true })
  throw new Error(`Timed out starting LVCE server at ${url}\n${output}`)
}
