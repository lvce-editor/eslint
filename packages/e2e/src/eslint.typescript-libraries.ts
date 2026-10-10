import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.typescript-libraries'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const workspaceUri = `file://${new URL('../fixtures/typescript-eslint', import.meta.url).pathname.replace(/^\/remote/, '')}`
  await Command.execute('Workspace.setUri', workspaceUri)
  for (const [name, type] of [
    ['default', 'string'],
    ['es', 'Promise<number>'],
    ['dom', 'string'],
    ['worker', 'string'],
    ['no-lib', 'number'],
    ['inherited', 'Promise<number>'],
    ['custom', '"Custom DOM"'],
  ]) {
    const uri = `${workspaceUri}/typed/${name}/test.ts`
    await Main.openUri(uri)
    const text = await FileSystem.readFile(uri)
    for (let iteration = 0; iteration < 2; iteration++) {
      const diagnostics = (await Command.executeExtensionCommand(
        'eslint.lint',
        { text, uri },
      )) as readonly { readonly message: string; readonly source: string }[]
      if (
        diagnostics.length !== 1 ||
        diagnostics[0].message !== `Library type: ${type}` ||
        diagnostics[0].source !== 'library/check'
      ) {
        throw new Error(
          `Unexpected ${name} diagnostics: ${JSON.stringify(diagnostics)}`,
        )
      }
    }
    await Editor.setCursor(0, 8)
    await Editor.openSourceActions()
    const fixAction = Locator('.SourceActionItem', {
      hasText: "Fix 'library/check' problem",
    })
    await expect(fixAction).toBeVisible()
    await Command.execute(
      'EditorSourceAction.selectItem',
      "Fix 'library/check' problem",
    )
    await Editor.shouldHaveText(text.replace('libraryValue', 'checkedValue'))
  }
}
