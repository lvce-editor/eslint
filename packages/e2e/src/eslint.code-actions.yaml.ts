import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.yaml'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const content = '---'
  const workspacePath = decodeURIComponent(
    new URL('../fixtures/eslint-plugin-yml', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/code-action.yml`
  await FileSystem.writeFile(uri, content)
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)
  await Editor.setCursor(0, 1)
  await Editor.openSourceActions()

  const action = Locator('.SourceActionItem', {
    hasText: 'Disable yml/no-empty-document for this line',
  })
  await expect(action).toBeVisible()
  await Command.execute(
    'EditorSourceAction.selectItem',
    'Disable yml/no-empty-document for this line',
  )
  await Editor.shouldHaveText(
    '# eslint-disable-next-line yml/no-empty-document\n---',
  )
}
