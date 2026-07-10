import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-esm'

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
      content: `export default [{ languageOptions: { globals: { value: 'readonly' } }, rules: { eqeqeq: 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'if (value == null) {}', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  const diagnostic = Locator('.Diagnostic')
  await expect(diagnostic).toHaveCount(1)
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 11,
      endColumnIndex: 13,
      endRowIndex: 1,
      message: "Expected '===' and instead saw '=='.",
      rowIndex: 1,
      source: 'eqeqeq',
      type: 'error',
    },
  ])
}
