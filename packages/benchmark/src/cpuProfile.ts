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
): Promise<void> => {
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
  await writeFile(outputPath, await readProtocolStream(cdp, stream))
}
