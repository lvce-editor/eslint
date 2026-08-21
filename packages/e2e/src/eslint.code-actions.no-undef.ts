import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.no-undef'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = 'missing()'
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/no-undef.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(0, 3)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable no-undef for the entire file',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable no-undef for the entire file',
  )
  await Editor.shouldHaveText(`/* eslint-disable no-undef */\n${content}`)
}
