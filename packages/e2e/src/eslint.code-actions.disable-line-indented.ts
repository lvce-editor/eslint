import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.disable-line-indented'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = "function main() {\n  console.log('test')\n}\nmain()"
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-code-actions',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/disable-line-indented.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(1, 7)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable for this line: no-console',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for this line: no-console',
  )
  await Editor.shouldHaveText(
    "function main() {\n  // eslint-disable-next-line no-console\n  console.log('test')\n}\nmain()",
  )
}
