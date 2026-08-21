import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.performance-trace-quick-pick'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Settings,
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
  await Settings.update({ 'editor.diagnostics': true })
  const uri = `${tmpDir}/test.js`
  await Main.openUri(uri)
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 0,
      endColumnIndex: 8,
      endRowIndex: 0,
      message: "Unexpected 'debugger' statement.",
      rowIndex: 0,
      source: 'no-debugger',
      type: 'error',
    },
  ])

  // Quick Pick executes extension commands without an editor-context argument.
  const trace = (await Command.executeExtensionCommand(
    'eslint.showPerformanceTrace',
  )) as any

  if (trace.error) {
    throw new Error(`Unexpected trace error: ${JSON.stringify(trace.error)}`)
  }
  if (trace.file.uri !== uri) {
    throw new Error(`Expected trace for ${uri}, received ${trace.file.uri}`)
  }
  await Editor.shouldHaveText(JSON.stringify(trace, null, 2))

  const secondRow = Locator('.EditorRow').nth(1)
  await expect(secondRow).toBeVisible()

  const traceTab = Locator('.MainTab[title$="eslint-performance-trace.json"]')
  await expect(traceTab).toBeVisible()
}
