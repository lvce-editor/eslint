import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.performance-trace-config-not-found'

export const test: Test = async ({
  Command,
  Editor,
  FileSystem,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir({ scheme: 'file' })
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(uri, 'debugger')
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

  const trace = (await Command.executeExtensionCommand(
    'eslint.showPerformanceTrace',
    {
      text: 'debugger',
      uri,
    },
  )) as any
  await Editor.shouldHaveText(JSON.stringify(trace))
  if (
    trace.error?.stage !== 'configDiscovery' ||
    trace.error?.details?.code !== 'ESLINT_CONFIG_NOT_FOUND' ||
    trace.configPath !== null ||
    trace.configDiscovery.directoryReadCount < 1
  ) {
    throw new Error(`Unexpected missing config trace: ${JSON.stringify(trace)}`)
  }
}
