import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-package-json'

export const test: Test = async ({
  Editor,
  expect,
  Locator,
  Main,
  Panel,
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
      columnIndex: 2,
      endColumnIndex: 15,
      endRowIndex: 5,
      message: "The field 'scripts' does nothing and can be removed.",
      rowIndex: 5,
      source: 'package-json/no-empty-fields',
      type: 'error',
    },
  ])
  const diagnostic = Locator('.Diagnostic.DiagnosticError')
  await expect(diagnostic).toBeVisible()

  await Panel.open('Problems')
  const problems = Locator('.Problem')
  await expect(problems).toHaveCount(2)
  const problem = problems.nth(1)
  await expect(problem).toHaveText(
    "The field 'scripts' does nothing and can be removed.package-json/no-empty-fields [Ln 6, Col 3]",
  )
}
