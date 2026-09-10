import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-react-hooks-valid'

export const test: Test = async ({
  Command,
  Editor,
  Main,
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
  await Main.openUri(`${workspacePath}/Valid.tsx`)
  await Command.executeExtensionCommand('eslint.lint')
  await Editor.shouldHaveDiagnostics([])
}
