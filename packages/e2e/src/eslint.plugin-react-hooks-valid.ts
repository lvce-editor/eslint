import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-react-hooks-valid'

export const test: Test = async ({ Command, Editor, Main, Settings }) => {
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-react-hooks',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  await Command.execute('Workspace.setUri', workspaceUri)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(`${workspaceUri}/Valid.tsx`)
  await Command.executeExtensionCommand('eslint.lint')
  await Editor.shouldHaveDiagnostics([])
}
