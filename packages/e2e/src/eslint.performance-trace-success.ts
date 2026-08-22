import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.performance-trace-success'

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
      content: `export default [{ rules: { 'no-debugger': 'error' } }]`,
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
  await Editor.shouldHaveText(JSON.stringify(trace, null, 2))
  if (trace.error) {
    throw new Error(`Unexpected trace error: ${JSON.stringify(trace.error)}`)
  }
  const fileUri = new URL(uri, 'file://').href
  const configUri = new URL(`${tmpDir}/eslint.config.js`, 'file://').href
  if (
    trace.schemaVersion !== 1 ||
    trace.fresh !== true ||
    trace.file.uri !== fileUri ||
    trace.configPath !== configUri ||
    trace.configDiscovery.configPath !== configUri ||
    trace.configDiscovery.directories.some(
      (directory: string) => !directory.startsWith('file://'),
    ) ||
    trace.configResolution.files.some(
      (file: { path: string }) => !file.path.startsWith('file://'),
    ) ||
    trace.eslintResolution.files.some(
      (file: { path: string }) => !file.path.startsWith('file://'),
    )
  ) {
    throw new Error(`Unexpected trace metadata: ${JSON.stringify(trace)}`)
  }
  if (
    trace.configResolution.fileReadCount < 1 ||
    trace.eslintResolution.fileReadCount < 1 ||
    trace.configEvaluation.durationMs < 0 ||
    trace.eslintEvaluation.durationMs < 0 ||
    trace.lint.durationMs < 0 ||
    trace.lint.diagnosticCount !== 1
  ) {
    throw new Error(`Unexpected trace stats: ${JSON.stringify(trace)}`)
  }
}
