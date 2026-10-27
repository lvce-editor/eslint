import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const replaceOnce = (content, before, after, marker) => {
  if (content.includes(marker)) return content
  if (content.split(before).length !== 2) {
    throw new Error(`Expected exactly one diagnostic patch target: ${marker}`)
  }
  return content.replace(before, after)
}

export const patchE2eMessageCapture = async (rendererPath) => {
  let renderer = await readFile(rendererPath, 'utf8')
  renderer = replaceOnce(
    renderer,
    `    const message = ipc.getData(event);
    if (isCommand(message)) {`,
    `    const message = ipc.getData(event);
    // Diagnostic capture: preserve renderer-worker arrival order.
    const messages = globalThis.___receivedMessages ||= [];
    let payload;
    try {
      payload = serialize(message);
    } catch (error) {
      payload = { serializationError: String(error) };
    }
    messages.push({
      sequence: messages.length,
      timestamp: performance.now(),
      wallTime: Date.now(),
      direction: 'renderer-worker->renderer-process',
      type: message?.method || 'response',
      payload,
    });
    if (isCommand(message)) {`,
    '// Diagnostic capture: preserve renderer-worker arrival order.',
  )
  await writeFile(rendererPath, renderer)

  const runnerPath = fileURLToPath(
    import.meta.resolve('@lvce-editor/test-with-playwright-worker'),
  )
  let runner = await readFile(runnerPath, 'utf8')
  runner = replaceOnce(
    runner,
    '      await page.addInitScript(install);',
    `      // Diagnostic capture: omit broad browser observers for this pass.
      if (process.env.LVCE_E2E_MESSAGE_CAPTURE !== '1') await page.addInitScript(install);`,
    '// Diagnostic capture: omit broad browser observers for this pass.',
  )
  runner = replaceOnce(
    runner,
    '        timeline: globalThis.__lvceTraceTimeline?.()',
    `        timeline: globalThis.__lvceTraceTimeline?.(),
        receivedMessages: globalThis.___receivedMessages || []`,
    'receivedMessages: globalThis.___receivedMessages',
  )
  runner = replaceOnce(
    runner,
    '  if (!capture.text && !capture.timeline) {',
    '  if (!capture.text && !capture.timeline && !capture.receivedMessages?.length) {',
    '!capture.receivedMessages?.length',
  )
  runner = replaceOnce(
    runner,
    '  if (capture.timeline) trace.timeline = capture.timeline;',
    `  if (capture.timeline) trace.timeline = capture.timeline;
  // Diagnostic capture: save independently even when the test times out.
  if (capture.receivedMessages) {
    const name = 'allmessages-' + getFileName(test).slice(0, -5) + '-' + (process.env.LVCE_E2E_ATTEMPT || 'local') + '.json';
    await writeFile(join(directory, name), JSON.stringify(capture.receivedMessages));
  }`,
    '// Diagnostic capture: save independently even when the test times out.',
  )
  await writeFile(runnerPath, runner)
  console.log(
    `Installed test-only message capture: ${rendererPath}; ${runnerPath}`,
  )
}
