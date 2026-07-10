import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-cjs'

export const test: Test = async ({
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir()
  await FileSystem.writeFiles([
    {
      content: `module.exports = [{ rules: { 'no-unused-vars': 'warn' } }]`,
      uri: `${tmpDir}/eslint.config.cjs`,
    },
    { content: 'const unused = 1', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  await expect(Locator('.Diagnostic')).toHaveCount(1)
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 7,
      endColumnIndex: 13,
      endRowIndex: 1,
      message: "'unused' is assigned a value but never used.",
      rowIndex: 1,
      source: 'no-unused-vars',
      type: 'warning',
    },
  ])
}
