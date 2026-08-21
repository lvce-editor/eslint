import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.disable-file'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = "console.log('test')"
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/disable-file.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(0, 5)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable no-console for the entire file',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable no-console for the entire file',
  )
  await Editor.shouldHaveText(`/* eslint-disable no-console */\n${content}`)
}
