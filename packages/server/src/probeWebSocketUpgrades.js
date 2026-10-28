import { fork, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const output = resolve(import.meta.dirname, '../../e2e/protocol-probes')
const attempt = (process.env.LVCE_E2E_ATTEMPT || 'local').replace(
  /[^\w-]/g,
  '_',
)
const count = Number(process.env.LVCE_WS_PROBE_COUNT || 1000)
const concurrency = Number(process.env.LVCE_WS_PROBE_CONCURRENCY || 4)
if (!Number.isInteger(count) || count < 1 || count > 5000) {
  throw new Error('LVCE_WS_PROBE_COUNT must be an integer between 1 and 5000')
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error(
    'LVCE_WS_PROBE_CONCURRENCY must be an integer between 1 and 8',
  )
}
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'lvce-websocket-probe-'))
const profilePaths = Object.fromEntries(
  [
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_CACHE_HOME',
    'XDG_STATE_HOME',
    'APPDATA',
    'LOCALAPPDATA',
  ].map((key) => [key, join(profile, key)]),
)
await Promise.all(
  Object.values(profilePaths).map((path) => mkdir(path, { recursive: true })),
)
const reservation = createServer()
reservation.listen(0, 'localhost')
await once(reservation, 'listening')
const { port } = reservation.address()
await new Promise((resolveClose) => reservation.close(resolveClose))
const server = fork(
  fileURLToPath(
    new URL('./bin/server.js', import.meta.resolve('@lvce-editor/server')),
  ),
  [],
  {
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      ...profilePaths,
      PORT: String(port),
      HOST: 'localhost',
    },
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
)
server.stdout.pipe(process.stdout)
server.stderr.pipe(process.stderr)
const results = []
let failed = 0
const sockets = new Set()

const probe = (type, index) =>
  new Promise((resolveProbe) => {
    const start = performance.now()
    let settled = false
    let peer
    const finish = (result, socket) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const record = {
        index,
        type,
        timestamp: Date.now(),
        durationMs: performance.now() - start,
        peer,
        ...result,
      }
      if (!socket) {
        resolveProbe(record)
        return
      }
      // A masked, empty WebSocket close frame; bound teardown separately from the handshake.
      const cleanup = setTimeout(() => socket.destroy(), 250)
      socket.once('close', () => {
        clearTimeout(cleanup)
        resolveProbe(record)
      })
      socket.end(Buffer.from([0x88, 0x80, 0, 0, 0, 0]))
    }
    const req = request({
      hostname: 'localhost',
      port,
      path: `/websocket/${type}`,
      agent: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        Origin: process.env.LVCE_WS_PROBE_ORIGIN || `http://localhost:${port}`,
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
    })
    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Handshake timed out' })
      req.destroy()
    }, 10000)
    req.on('socket', (socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      socket.on('error', (error) => {
        if (settled && peer) peer.teardownCode = error.code
      })
      socket.once('connect', () => {
        peer = {
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
          localAddress: socket.localAddress,
          localPort: socket.localPort,
        }
      })
    })
    req.once('upgrade', (response, socket) =>
      finish(
        { ok: response.statusCode === 101, statusCode: response.statusCode },
        socket,
      ),
    )
    req.once('response', (response) => {
      finish({ ok: false, statusCode: response.statusCode })
      response.resume()
    })
    req.once('error', (error) =>
      finish({
        ok: false,
        error: String(error),
        code: error.code,
        causes: error.errors?.map((cause) => ({
          code: cause.code,
          address: cause.address,
          port: cause.port,
        })),
      }),
    )
    req.end()
  })

let failure
try {
  const [ready] = await Promise.race([
    once(server, 'message', { signal: AbortSignal.timeout(30000) }),
    once(server, 'exit').then(([code, signal]) => {
      throw new Error(`Server exited before readiness: ${code}, ${signal}`)
    }),
  ])
  if (ready !== 'ready') throw new Error('Unexpected server readiness message')
  for (let index = 0; index < count; index += concurrency) {
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(concurrency, count - index) },
        (_, offset) => {
          const occurrence = index + offset
          return probe(
            occurrence % 2 ? 'file-system-process' : 'shared-process',
            occurrence,
          )
        },
      ),
    )
    for (const result of batch) {
      results.push(result)
      if (!result.ok) {
        failed++
        console.error('WEBSOCKET_PROBE_FAILURE', JSON.stringify(result))
      }
    }
    if (failed >= 10) break
  }
} catch (error) {
  failure = String(error)
} finally {
  for (const socket of sockets) socket.destroy()
  let cleanupError
  try {
    if (process.platform === 'win32') {
      await promisify(execFile)(
        'taskkill',
        ['/PID', String(server.pid), '/T', '/F'],
        { timeout: 10000 },
      )
    } else {
      process.kill(-server.pid, 'SIGTERM')
    }
    if (server.exitCode === null && server.signalCode === null)
      await once(server, 'exit', { signal: AbortSignal.timeout(5000) })
  } catch (error) {
    if (error.code !== 'ESRCH') cleanupError = String(error)
  }
  if (!cleanupError) await rm(profile, { recursive: true, force: true })
  const summary = {
    attempt,
    node: process.version,
    architecture: process.arch,
    requested: count,
    concurrency,
    completed: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    failure,
    cleanupError,
    preservedProfile: cleanupError ? profile : undefined,
    results,
  }
  await writeFile(
    join(output, `websocket-probe-${attempt}.json`),
    JSON.stringify(summary, null, 2),
  )
  console.log(
    'WEBSOCKET_PROBE_SUMMARY',
    JSON.stringify({ ...summary, results: undefined }),
  )
  if (failure || cleanupError || summary.failed || results.length !== count)
    process.exitCode = 1
}
