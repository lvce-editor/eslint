import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const replaceOnce = (content, before, after, marker) => {
  if (content.includes(marker)) return content
  if (content.split(before).length !== 2) {
    throw new Error(`Expected exactly one diagnostic patch target: ${marker}`)
  }
  return content.replace(before, after)
}

export const patchE2eMessageCapture = async (rendererPath, testWorkerPath) => {
  let testWorker = await readFile(testWorkerPath, 'utf8')
  testWorker = replaceOnce(
    testWorker,
    'const invokeHelper = async (callbacks, ipc, method, params, useSendAndTransfer) => {',
    `// Diagnostic capture: test-worker RPC lifecycle.
const recordTestRpc = (phase, id, method) => {
  const events = globalThis.___testRpcEvents ||= [];
  if (events.length >= 5000) {
    globalThis.___testRpcDropped = (globalThis.___testRpcDropped || 0) + 1;
    return;
  }
  const timestamp = performance.now();
  events.push({ sequence: events.length, phase, id, method, timestamp, epochTimestamp: performance.timeOrigin + timestamp });
};
const invokeHelper = async (callbacks, ipc, method, params, useSendAndTransfer) => {`,
    '// Diagnostic capture: test-worker RPC lifecycle.',
  )
  testWorker = replaceOnce(
    testWorker,
    '  const message = create$9(id, method, params);',
    `  recordTestRpc('invoke', id, method);
  const message = create$9(id, method, params);`,
    "recordTestRpc('invoke', id, method)",
  )
  testWorker = replaceOnce(
    testWorker,
    `  const responseMessage = await promise;
  return unwrapJsonRpcResult(responseMessage);`,
    `  recordTestRpc('sent', id, method);
  const responseMessage = await promise;
  recordTestRpc(responseMessage.error ? 'rejected' : 'resolved', id, method);
  return unwrapJsonRpcResult(responseMessage);`,
    "recordTestRpc('sent', id, method)",
  )
  for (const [signature, stage] of [
    ['const execute = async (href, platform, assetDir) => {', 'test.import'],
    [
      'const executeTest2 = async (name, fn, globals, timestampGenerator) => {',
      'test.run',
    ],
    ['  let error = await callFunction(fn, globals);', 'test.returned'],
  ]) {
    const record = `recordTestRpc('stage', 0, '${stage}');`
    testWorker = replaceOnce(
      testWorker,
      signature,
      `${signature}\n  ${record}`,
      record,
    )
  }
  await writeFile(testWorkerPath, testWorker)

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
    'const getUrlFromTestFile = (absolutePath, port, traceFocus, traceRendererWorker) => {',
    `const getUrlFromTestFile = (absolutePath, port, traceFocus, traceRendererWorker) => {
  // Diagnostic capture: RPC-only pass uses the original untraced test URL.
  if (process.env.LVCE_E2E_RPC_ONLY === '1') traceRendererWorker = false;`,
    '// Diagnostic capture: RPC-only pass uses the original untraced test URL.',
  )
  runner = replaceOnce(
    runner,
    `const exportTrace = async ({
  directory,
  page,
  test
}) => {
  let capture;`,
    `const exportTrace = async ({
  directory,
  page,
  test
}) => {
  // Diagnostic capture: inspect test-worker state after the test finishes.
  const workers = page.workers();
  const testWorkers = workers.filter(worker => worker.url().includes('/packages/test-worker/'));
  const rpcCaptures = await Promise.all(testWorkers.map(async worker => {
    let timer;
    try {
      const capture = await Promise.race([
        worker.evaluate(() => ({ events: globalThis.___testRpcEvents || [], dropped: globalThis.___testRpcDropped || 0 })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Test-worker diagnostic evaluation timed out')), 5000); }),
      ]);
      return { url: worker.url(), ...capture };
    } catch (error) {
      return { url: worker.url(), captureError: String(error) };
    } finally {
      clearTimeout(timer);
    }
  }));
  const rpcName = 'test-rpc-' + getFileName(test).slice(0, -5) + '-' + (process.env.LVCE_E2E_ATTEMPT || 'local') + '.json';
  await writeFile(join(directory, rpcName), JSON.stringify({ workers: rpcCaptures, workerUrls: workers.map(worker => worker.url()) }));
  let capture;`,
    '// Diagnostic capture: inspect test-worker state after the test finishes.',
  )
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
    `Installed test-only message capture: ${rendererPath}; ${testWorkerPath}; ${runnerPath}`,
  )
}
