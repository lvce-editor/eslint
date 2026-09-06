import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-react-hooks'

export const test: Test = async ({
  Command,
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
      '../fixtures/eslint-plugin-react-hooks',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  await Workspace.setPath(workspacePath)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(`${workspacePath}/App.tsx`)

  const diagnostic = Locator('.Diagnostic.DiagnosticError')
  await expect(diagnostic).toBeVisible()
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 4,
      endColumnIndex: 13,
      endRowIndex: 4,
      message:
        'React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render.',
      rowIndex: 4,
      source: 'react-hooks/rules-of-hooks',
      type: 'error',
    },
    {
      columnIndex: 7,
      endColumnIndex: 9,
      endRowIndex: 6,
      message:
        "React Hook useEffect has a missing dependency: 'value'. Either include it or remove the dependency array.",
      rowIndex: 6,
      source: 'react-hooks/exhaustive-deps',
      type: 'warning',
    },
  ])
  await Panel.open('Problems')
  const problems = Locator('.Problem')
  await expect(problems).toHaveCount(3)

  await Main.openUri(`${workspacePath}/Valid.tsx`)
  await Command.executeExtensionCommand('eslint.lint')
  await Editor.shouldHaveDiagnostics([])
}
