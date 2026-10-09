import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.disable-file-shebang'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const content = "#!/usr/bin/env node\nconsole.log('test')"
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-code-actions',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  const uri = `${workspaceUri}/disable-file-shebang.js`
  await FileSystem.writeFile(uri, content)
  await Command.execute('Workspace.setUri', workspaceUri)
  await Main.openUri(uri)
  await Editor.setCursor(1, 5)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable for the entire file: no-console',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable for the entire file: no-console',
  )
  await Editor.shouldHaveText(
    "#!/usr/bin/env node\n/* eslint-disable no-console */\nconsole.log('test')",
  )
}
