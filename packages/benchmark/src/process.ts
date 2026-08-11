import { spawn, type ChildProcess } from 'node:child_process'

// cspell:ignore taskkill

export const runProcess = async (
  command: string,
  args: readonly string[],
  cwd?: string,
): Promise<void> => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  const code = await new Promise<number | null>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', resolvePromise)
  })
  if (code !== 0) {
    throw new Error(`${command} exited with code ${code}`)
  }
}

const waitForExit = async (
  child: ChildProcess,
  timeout: number,
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true
  }
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.off('exit', handleExit)
      resolvePromise(false)
    }, timeout)
    const handleExit = (): void => {
      clearTimeout(timer)
      resolvePromise(true)
    }
    child.once('exit', handleExit)
  })
}

export const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  try {
    if (process.platform === 'win32') {
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    return
  }
  if (await waitForExit(child, 2000)) {
    return
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Process may have exited between checks.
    }
  }
}
