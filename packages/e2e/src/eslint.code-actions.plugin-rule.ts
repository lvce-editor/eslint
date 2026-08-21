import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.plugin-rule'

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
    'const values = [1]\n\nvalues.forEach((value) => console.log(value))'
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-plugin-unicorn',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/code-action-plugin-rule.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(2, 10)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable unicorn/no-for-each for this line',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable unicorn/no-for-each for this line',
  )
  await Editor.shouldHaveText(
    'const values = [1]\n\n// eslint-disable-next-line unicorn/no-for-each\nvalues.forEach((value) => console.log(value))',
  )
}
