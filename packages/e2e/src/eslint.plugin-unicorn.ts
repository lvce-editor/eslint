import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-unicorn'

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
      '../fixtures/eslint-plugin-unicorn',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/test.js`
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(uri)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 7,
      endColumnIndex: 14,
      endRowIndex: 2,
      message: 'Use `for…of` instead of `.forEach(…)`.',
      rowIndex: 2,
      source: 'unicorn/no-for-each',
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
    'Use `for…of` instead of `.forEach(…)`.unicorn/no-for-each [Ln 3, Col 8]',
  )
}
