/* eslint-disable unicorn/no-global-object-property-assignment */

const createStream = () => ({
  destroy: (): void => {},
  emit: (): void => {},
  end: (): void => {},
  fd: 0,
  isTTY: false,
  on: (): void => {},
  once: (): void => {},
  pause: (): void => {},
  pipe: (): void => {},
  read: (): null => null,
  removeListener: (): void => {},
  resume: (): void => {},
  setEncoding: (): void => {},
  unpipe: (): void => {},
  write: (): void => {},
})

export const installNodeProcess = (): void => {
  if (typeof process !== 'undefined') {
    return
  }

  const startTime = Date.now()
  const startHrtime = performance.now()
  const hrtime = (time?: readonly [number, number]): [number, number] => {
    const elapsed = performance.now() - startHrtime
    const seconds = Math.floor(elapsed / 1000)
    const nanoseconds = Math.floor((elapsed % 1000) * 1_000_000)
    if (time) {
      return [seconds - time[0], nanoseconds - time[1]]
    }
    return [seconds, nanoseconds]
  }
  hrtime.bigint = (): bigint => {
    const elapsed = performance.now() - startHrtime
    return BigInt(Math.floor(elapsed * 1_000_000))
  }

  globalThis.process = {
    arch: 'x64',
    argv: [],
    cwd: (): string => '/',
    env: {},
    exit: (): void => {},
    hrtime,
    memoryUsage: () => ({
      arrayBuffers: 0,
      external: 0,
      heapTotal: 0,
      heapUsed: 0,
      rss: 0,
    }),
    nextTick: (fn: () => void): void => {
      setTimeout(fn, 0)
    },
    pid: 1,
    platform: 'browser',
    ppid: 0,
    stderr: createStream(),
    stdin: createStream(),
    stdout: createStream(),
    title: 'browser',
    uptime: (): number => (Date.now() - startTime) / 1000,
    version: 'v0.0.0',
    versions: {
      node: '0.0.0',
    },
  }
}
