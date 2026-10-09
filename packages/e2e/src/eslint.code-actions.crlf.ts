import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.crlf'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = 'const value = 1\r\nconsole.log(value)\r\n'
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-code-actions',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/crlf.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(1, 5)
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
    'const value = 1\n// eslint-disable-next-line no-console\nconsole.log(value)\n',
  )
  await Command.execute('Main.save')
  const savedText = await FileSystem.readFile(uri)
  if (
    savedText !==
    'const value = 1\r\n// eslint-disable-next-line no-console\r\nconsole.log(value)\r\n'
  ) {
    throw new Error(
      `Expected the code action to preserve CRLF on save, received ${JSON.stringify(savedText)}`,
    )
  }
}
