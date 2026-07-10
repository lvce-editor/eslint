import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-relative-import'

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
      content: `import rules from './rules.js'; export default [{ rules }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: `export default { 'no-empty': 'error' }`,
      uri: `${tmpDir}/rules.js`,
    },
    { content: 'if (true) {}', uri: `${tmpDir}/test.js` },
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
      message: 'Empty block statement.',
      rowIndex: 1,
      source: 'no-empty',
      type: 'error',
    },
  ])
}
