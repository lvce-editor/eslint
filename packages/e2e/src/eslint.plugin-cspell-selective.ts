import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-cspell-selective'

export const test: Test = async ({ Command, FileSystem }) => {
  const workspaceUri = `file://${new URL(
    '../fixtures/eslint-plugin-cspell-selective',
    import.meta.url,
  ).pathname.replace(/^\/remote/, '')}`
  await Command.execute('Workspace.setUri', workspaceUri)
  // Start disabled, enable different dictionary selections, then disable again
  // within one evaluation runtime. Other rules must keep reporting normally.
  for (const file of [
    'disabled.js',
    'default.js',
    'explicit.js',
    'disabled.js',
  ]) {
    const uri = `${workspaceUri}/${file}`
    const text = await FileSystem.readFile(uri)
    const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
      text,
      uri,
    })) as readonly { readonly source: string }[]
    const expected = file === 'disabled.js' ? ['no-debugger'] : []
    const actual = diagnostics.map(({ source }) => source)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${file}: unexpected diagnostics ${JSON.stringify(diagnostics)}`,
      )
    }
  }
}
