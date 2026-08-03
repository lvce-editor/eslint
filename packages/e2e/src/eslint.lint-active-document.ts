import type { Test } from '@lvce-editor/test-with-playwright'

export const skip = 1

export const name = 'eslint.lint-active-document'

export const test: Test = async ({
  Command,
  Editor,
  FileSystem,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  await FileSystem.writeFile(`${tmpDir}/test.js`, 'debugger')
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  await Command.executeExtensionCommand('eslint.lint')
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
}
