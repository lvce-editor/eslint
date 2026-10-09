import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.fixable-rule'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = 'const value = "test"\nconsole.log(value)'
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-code-actions',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/fixable-rule.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(0, 15)
  await Editor.openSourceActions()

  const fixAction = Locator('.SourceActionItem', {
    hasText: "Fix 'quotes' problem",
  })
  await expect(fixAction).toBeVisible()
  const disableAction = Locator('.SourceActionItem', {
    hasText: 'Disable for this line: quotes',
  })
  await expect(disableAction).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for this line: quotes',
  )
  await Editor.shouldHaveText(`// eslint-disable-next-line quotes\n${content}`)
}
