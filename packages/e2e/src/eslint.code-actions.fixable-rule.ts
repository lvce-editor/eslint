import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.fixable-rule'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = 'const value = "test"\nconsole.log(value)'
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-code-actions',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/fixable-rule.js`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(0, 15)
  await Editor.openSourceActions()

  const fixAction = Locator('.SourceActionItem', {
    hasText: "Fix 'quotes' problem",
  })
  await expect(fixAction).toBeVisible()
  const disableAction = Locator('.SourceActionItem', {
    hasText: 'Disable quotes for this line',
  })
  await expect(disableAction).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable quotes for this line',
  )
  await Editor.shouldHaveText(`// eslint-disable-next-line quotes\n${content}`)
}
