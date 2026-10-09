import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.plugin-rule'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content =
    'const values = [1]\n\nvalues.forEach((value) => console.log(value))'
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-unicorn',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/code-action-plugin-rule.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(2, 10)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable for this line: unicorn/no-for-each',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for this line: unicorn/no-for-each',
  )
  await Editor.shouldHaveText(
    'const values = [1]\n\n// eslint-disable-next-line unicorn/no-for-each\nvalues.forEach((value) => console.log(value))',
  )
}
