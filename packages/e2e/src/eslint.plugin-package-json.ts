import type { Test } from '@lvce-editor/test-with-playwright'

// cspell:ignore lifecycles
export const name = 'eslint.plugin-package-json'

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
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-plugin-package-json',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/package.json`
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 13,
      endColumnIndex: 3,
      endRowIndex: 8,
      message:
        "Entries in 'scripts' are not in lexicographical order and grouped by lifecycles",
      rowIndex: 5,
      source: 'package-json/sort-collections',
      type: 'error',
    },
  ])
  const diagnostic = Locator('.Diagnostic.DiagnosticError')
  await expect(diagnostic).toBeVisible()

  await Editor.setCursor(5, 14)
  await Editor.openSourceActions()
  const fixAction = Locator('.SourceActionItem', {
    hasText: "Fix 'package-json/sort-collections' problem",
  })
  await expect(fixAction).toBeVisible()
  const disableLineAction = Locator('.SourceActionItem', {
    hasText: 'Disable for this line: package-json/sort-collections',
  })
  await expect(disableLineAction).toHaveCount(0)
  const disableFileAction = Locator('.SourceActionItem', {
    hasText: 'Disable for the entire file: package-json/sort-collections',
  })
  await expect(disableFileAction).toHaveCount(0)
  await Command.execute(
    'EditorSourceAction.selectItem',
    "Fix 'package-json/sort-collections' problem",
  )
  const text = await FileSystem.readFile(uri)
  JSON.parse(text)
  await Editor.shouldHaveDiagnostics([])
}
