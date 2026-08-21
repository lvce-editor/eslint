import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.merge-block-directive'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content =
    "/* eslint-disable-next-line no-debugger */\ndebugger; console.log('test')"
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/merge-block-directive.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(1, 15)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable no-console for this line',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable no-console for this line',
  )
  await Editor.shouldHaveText(
    "/* eslint-disable-next-line no-debugger, no-console */\ndebugger; console.log('test')",
  )
}
