import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-yml'

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
    new URL('../fixtures/eslint-plugin-yml', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/test.yml`
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 0,
      endColumnIndex: 3,
      endRowIndex: 0,
      message: 'Empty documents are forbidden.',
      rowIndex: 0,
      source: 'yml/no-empty-document',
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
    'Empty documents are forbidden.yml/no-empty-document [Ln 1, Col 1]',
  )
}
