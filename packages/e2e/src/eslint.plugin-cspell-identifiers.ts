import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-cspell-identifiers'

export const test: Test = async ({ Command, FileSystem }) => {
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-plugin-cspell-disabled',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/identifiers.js`
  await Command.execute('Workspace.setUri', workspacePath)
  const text = await FileSystem.readFile(uri)
  await Command.executeExtensionCommand('eslint.lint', {
    text: `// comment\n${text}`,
    uri,
  })
  const diagnostics = await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })
  if (JSON.stringify(diagnostics) !== '[]') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
