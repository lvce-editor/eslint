import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.css'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = '.example {\n  color: red !important;\n}'
  const workspacePath = decodeURIComponent(
    new URL('../fixtures/eslint-plugin-css', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/code-action.css`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(1, 16)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable css/no-important for this line',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable css/no-important for this line',
  )
  await Editor.shouldHaveText(
    '.example {\n  /* eslint-disable-next-line css/no-important */\n  color: red !important;\n}',
  )
}
