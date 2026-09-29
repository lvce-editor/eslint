import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.warning-severity'

export const test: Test = async ({
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Panel,
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
  const uri = `${tmpDir}/test.js`
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
      content: `module.exports = [{ rules: { 'no-debugger': 'warn' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: 'debugger',
      uri,
    },
  ])
  await Workspace.setUri(tmpDir)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 0,
      endColumnIndex: 8,
      endRowIndex: 0,
      message: "Unexpected 'debugger' statement.",
      rowIndex: 0,
      source: 'no-debugger',
      type: 'warning',
    },
  ])

  const warningSquiggly = Locator('.DiagnosticWarning')
  const errorSquiggly = Locator('.DiagnosticError')
  await expect(warningSquiggly).toBeVisible()
  await expect(errorSquiggly).toHaveCount(0)

  await Panel.open('Problems')
  const problems = Locator('.Viewlet.Problems')
  const warningIcon = problems.locator('.ProblemsWarningIcon')
  const errorIcon = problems.locator('.ProblemsErrorIcon')
  await expect(warningIcon).toBeVisible()
  await expect(errorIcon).toHaveCount(0)
}
