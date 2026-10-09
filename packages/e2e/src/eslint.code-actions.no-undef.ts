import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.no-undef'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = 'missing()'
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-code-actions',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/no-undef.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(0, 3)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable for the entire file: no-undef',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for the entire file: no-undef',
  )
  await Editor.shouldHaveText(`/* eslint-disable no-undef */\n${content}`)
}
