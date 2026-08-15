import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-typescript-eslint'

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
    new URL('../fixtures/typescript-eslint', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/test.ts`
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 13,
      endColumnIndex: 16,
      endRowIndex: 0,
      message: 'Unexpected any. Specify a different type.',
      rowIndex: 0,
      source: '@typescript-eslint/no-explicit-any',
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
    'Unexpected any. Specify a different type.@typescript-eslint/no-explicit-any [Ln 1, Col 14]',
  )
}
