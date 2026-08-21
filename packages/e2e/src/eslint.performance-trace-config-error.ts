import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.performance-trace-config-error'

export const test: Test = async ({
  Command,
  Editor,
  FileSystem,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir({ scheme: 'file' })
  const eslintDirectory = `${tmpDir}/node_modules/eslint`
  const eslintEntry = decodeURIComponent(
    new URL(
      import.meta.resolve('../../../node_modules/eslint/lib/api.js'),
    ).pathname.replace(/^\/remote/, ''),
  )
  await FileSystem.mkdir(`${tmpDir}/node_modules`)
  await FileSystem.mkdir(eslintDirectory)
  await FileSystem.setFiles([
    {
      content: JSON.stringify({ main: 'index.cjs', name: 'eslint' }),
      uri: `${eslintDirectory}/package.json`,
    },
    {
      content: `module.exports = require(${JSON.stringify(eslintEntry)})`,
      uri: `${eslintDirectory}/index.cjs`,
    },
    {
      content: `throw new Error('broken config'); export default []`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'debugger', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  const uri = `${tmpDir}/test.js`
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
    trace.error?.stage !== 'configEvaluation' ||
    !trace.error?.details?.message?.includes('broken config') ||
    trace.configResolution.fileReadCount < 1 ||
    trace.configEvaluation.durationMs < 0
  ) {
    throw new Error(`Unexpected config error trace: ${JSON.stringify(trace)}`)
  }
}
