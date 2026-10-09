import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.yaml'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = '---'
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-yml',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/code-action.yml`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(0, 1)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable for this line: yml/no-empty-document',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for this line: yml/no-empty-document',
  )
  await Editor.shouldHaveText(
    '# eslint-disable-next-line yml/no-empty-document\n---',
  )
}
