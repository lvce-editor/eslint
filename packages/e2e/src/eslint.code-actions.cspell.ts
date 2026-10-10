import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.code-actions.cspell'

export const test: Test = async ({
  Command,
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-cspell-selective',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  await Command.execute('Workspace.setUri', workspaceUri)
  const uri = `${workspaceUri}/fix.js`
  const text = await FileSystem.readFile(uri)
  // Await CSpell's cold initialization before opening the source-action menu.
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly { readonly message: string; readonly source: string }[]
  if (
    diagnostics.length !== 1 ||
    diagnostics[0].source !== '@cspell/spellchecker' ||
    diagnostics[0].message !==
      `Forbidden word: "${text.trim().slice(3)}" (church)`
  ) {
    throw new Error(
      `Unexpected spelling diagnostics: ${JSON.stringify(diagnostics)}`,
    )
  }
  await Main.openUri(uri)
  await Editor.setCursor(0, 5)
  await Editor.openSourceActions()
  const name = "Fix '@cspell/spellchecker' problem"
  const fixAction = Locator('.SourceActionItem', { hasText: name })
  await expect(fixAction).toBeVisible()
  await Command.execute('EditorSourceAction.selectItem', name)
  await Editor.shouldHaveText('// church\n')
}
