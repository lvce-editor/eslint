import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-json-import'

export const test: Test = async ({ Editor, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  await FileSystem.writeFiles([
    {
      content: `module.exports = require('./config.json')`,
      uri: `${tmpDir}/eslint.config.cjs`,
    },
    {
      content: `[{"rules":{"no-constant-condition":"error"}}]`,
      uri: `${tmpDir}/config.json`,
    },
    { content: `if (true) console.log('x')`, uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  await Editor.shouldHaveDiagnosticProviderResult([
    {
      columnIndex: 5,
      endColumnIndex: 9,
      endRowIndex: 1,
      message: 'Unexpected constant condition.',
      rowIndex: 1,
      source: 'no-constant-condition',
      type: 'error',
    },
  ])
}
