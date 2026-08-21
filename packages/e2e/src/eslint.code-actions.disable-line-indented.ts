import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.disable-line-indented'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = "function main() {\n  console.log('test')\n}\nmain()"
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/disable-line-indented.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(1, 7)
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
    "function main() {\n  // eslint-disable-next-line no-console\n  console.log('test')\n}\nmain()",
  )
}
