import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-css'

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
    new URL('../fixtures/eslint-plugin-css', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/test.css`
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 13,
      endColumnIndex: 23,
      endRowIndex: 1,
      message: 'Unexpected !important flag found.',
      rowIndex: 1,
      source: 'css/no-important',
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
    'Unexpected !important flag found.css/no-important [Ln 2, Col 14]',
  )
}
