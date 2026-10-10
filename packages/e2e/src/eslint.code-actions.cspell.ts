import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.cspell'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  Locator,
  Main,
}) => {
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-cspell-selective',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(`${workspaceUri}/fix.js`)
  await Editor.setCursor(0, 5)
  await Editor.openSourceActions()
  const name = "Fix '@cspell/spellchecker' problem"
  const fixAction = Locator('.SourceActionItem', { hasText: name })
  await expect(fixAction).toBeVisible()
  await Command.execute('EditorSourceAction.selectItem', name)
  await Editor.shouldHaveText('// church\n')
}
