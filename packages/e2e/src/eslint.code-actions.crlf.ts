import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.crlf'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = 'const value = 1\r\nconsole.log(value)\r\n'
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/crlf.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(1, 5)
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
    'const value = 1\r\n// eslint-disable-next-line no-console\r\nconsole.log(value)\r\n',
  )
}
