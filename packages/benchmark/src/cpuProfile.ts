import type { CDPSession } from 'playwright'
import { writeFile } from 'node:fs/promises'

const readProtocolStream = async (
  cdp: CDPSession,
  stream: string,
): Promise<string> => {
  let result = ''
  let done = false
  while (!done) {
    const chunk = (await cdp.send('IO.read', { handle: stream })) as {
      readonly data?: string
      readonly eof?: boolean
    }
    result += chunk.data || ''
    done = Boolean(chunk.eof)
  }
  try {
    await cdp.send('IO.close', { handle: stream })
  } catch {
    // The browser may close a completed stream before this command arrives.
  }
  return result
}

export const startCpuProfile = async (cdp: CDPSession): Promise<void> => {
  await cdp.send('Tracing.start', {
    categories:
      'devtools.timeline,v8,blink.user_timing,loading,disabled-by-default-v8.cpu_profiler',
    options: 'sampling-frequency=1000',
    transferMode: 'ReturnAsStream',
  })
}

export const stopCpuProfile = async (
  cdp: CDPSession,
  outputPath: string,
): Promise<number | undefined> => {
  const tracingComplete = new Promise<string>((resolvePromise) => {
    cdp.once('Tracing.tracingComplete', (event: { readonly stream?: string }) =>
      resolvePromise(event.stream || ''),
    )
  })
  await cdp.send('Tracing.end')
  const stream = await tracingComplete
  if (!stream) {
    throw new Error('Chromium CPU profile did not return a stream')
  }
  const trace = await readProtocolStream(cdp, stream)
  await writeFile(outputPath, trace)
  return getUserTimingDuration(trace, 'eslint-benchmark-lint')
}

const getUserTimingTimestamp = (
  trace: string,
  name: string,
  phase: 'b' | 'e',
): number | undefined => {
  const marker = `"name":"${name}","ph":"${phase}"`
  const markerIndex = trace.indexOf(marker)
  if (markerIndex === -1) {
    return undefined
  }
  const lineStart = trace.lastIndexOf('\n', markerIndex) + 1
  const lineEnd = trace.indexOf('\n', markerIndex)
  const line = trace
    .slice(lineStart, lineEnd === -1 ? trace.length : lineEnd)
    .replace(/,$/, '')
  const event = JSON.parse(line) as { readonly ts?: unknown }
  return typeof event.ts === 'number' ? event.ts : undefined
}

export const getUserTimingDuration = (
  trace: string,
  name: string,
): number | undefined => {
  const start = getUserTimingTimestamp(trace, name, 'b')
  const end = getUserTimingTimestamp(trace, name, 'e')
  return start === undefined || end === undefined
    ? undefined
    : (end - start) / 1000
}
