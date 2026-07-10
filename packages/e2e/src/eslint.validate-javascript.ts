import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.validate-javascript'

export const test: Test = async ({ Editor, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  await FileSystem.writeFile(`${tmpDir}/test.js`, 'debugger')
  await Workspace.setPath(tmpDir)
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 1,
      endColumnIndex: 9,
      endRowIndex: 1,
      message: "Unexpected 'debugger' statement.",
      rowIndex: 1,
      source: 'no-debugger',
      type: 'error',
    },
  ])
}
