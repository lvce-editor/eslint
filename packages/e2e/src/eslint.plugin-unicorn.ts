import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-unicorn'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const workspacePath = decodeURIComponent(
    new URL(
      '../fixtures/eslint-plugin-unicorn',
      import.meta.url,
    ).pathname.replace(/^\/remote/, ''),
  )
  const uri = `${workspacePath}/test.js`
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)

  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly { readonly source: string; readonly type: string }[]
  const actual = diagnostics.map(({ source, type }) => ({ source, type }))
  const expected = [{ source: 'unicorn/no-for-each', type: 'error' }]
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
